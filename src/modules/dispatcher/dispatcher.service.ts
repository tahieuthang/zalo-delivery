import { redis } from '@infra/redis/redis-client';
import {
  findNearby,
  isShipperBusy,
  markShipperBusy,
} from '@infra/redis/geo.service';
import { getRoute } from '@infra/osrm/osrm-client';
import { producer } from '@infra/kafka/producer';
import { KAFKA_TOPICS } from '@infra/kafka/topics';
import * as orderService from '@modules/order/order.service';
import { ulid } from '@shared/utils/id-generator';
import logger from '@shared/logger/logger';
import { prisma } from '@infra/database/prisma-client';
import { notificationService } from '@infra/notification';

/**
 * Key pattern standard document:
 * Dedup:     webhook:dedup:{id}
 * Geo:       shipper:locations
 * Busy set:  shipper:busy
 * Route:     tracking:route:{orderId}
 * Retry:     order:retry:{orderId}
 */

/**
 * Select candidates, cache in Redis, and start the offer flow.
 */
export async function dispatchOrder(event: any): Promise<void> {
  const { orderId, pickupLat, pickupLng } = event.payload;
  const correlationId = event.metadata?.correlationId || ulid();

  logger.info({ orderId, pickupLat, pickupLng }, 'Starting dispatcher search for nearest shipper with confirmation flow');

  // 1. Search for nearby shippers within 3km (max 5 candidates)
  const nearby = await findNearby(pickupLng, pickupLat, 3, 5);
  const candidates = nearby as [string, string][];

  if (!candidates || candidates.length === 0) {
    logger.warn({ orderId }, 'No shippers found in Redis geo index');
    await handleNoShipperFound(event);
    return;
  }

  const eligibleCandidates: Array<{
    shipperId: string;
    distanceMeters: number;
    durationSeconds: number;
    coordinates: [number, number][];
  }> = [];

  // 2. Filter out busy, offline, or cooldown shippers
  for (const [shipperId] of candidates) {
    const hasCooldown = await redis.get(`shipper:cooldown:${shipperId}`);
    if (hasCooldown) {
      logger.info({ shipperId, orderId }, 'Shipper is on cooldown, skipping');
      continue;
    }

    const isBusy = await isShipperBusy(shipperId);
    if (isBusy) {
      logger.info({ shipperId, orderId }, 'Shipper is currently busy, skipping');
      continue;
    }

    // Get exact shipper location coordinates from Redis
    const pos = await redis.geopos('shipper:locations', shipperId);
    if (!pos || !pos[0]) continue;
    const [shLngStr, shLatStr] = pos[0];
    if (!shLngStr || !shLatStr) continue;

    const shLng = parseFloat(shLngStr);
    const shLat = parseFloat(shLatStr);

    try {
      // Calculate real driving route from shipper position to pickup location
      const route = await getRoute(
        { lng: shLng, lat: shLat },
        { lng: pickupLng, lat: pickupLat },
      );

      eligibleCandidates.push({
        shipperId,
        distanceMeters: route.distanceMeters,
        durationSeconds: route.durationSeconds,
        coordinates: route.coordinates,
      });
    } catch (err) {
      logger.error({ err, shipperId, orderId }, 'Failed to compute route for shipper');
    }
  }

  if (eligibleCandidates.length === 0) {
    logger.warn({ orderId }, 'No eligible (free) shippers found after filtering');
    await handleNoShipperFound(event);
    return;
  }

  // Sort candidates by driving duration ascending
  eligibleCandidates.sort((a, b) => a.durationSeconds - b.durationSeconds);

  // 3. Save sorted candidates list to Redis (cache candidates)
  const candidatesKey = `order:candidates:${orderId}`;
  await redis.set(candidatesKey, JSON.stringify(eligibleCandidates), 'EX', 300);

  // 4. Offer order to the first candidate
  await offerOrderToNextCandidate(orderId, correlationId);
}

/**
 * Core function to send an order offer to the next candidate in the queue.
 */
export async function offerOrderToNextCandidate(orderId: string, correlationId: string): Promise<void> {
  const candidatesKey = `order:candidates:${orderId}`;
  const candidatesJson = await redis.get(candidatesKey);
  if (!candidatesJson) {
    logger.warn({ orderId }, 'No candidates list found in Redis');
    await handleNoShipperFound({ payload: { orderId }, metadata: { correlationId } });
    return;
  }

  const candidates = JSON.parse(candidatesJson);
  if (candidates.length === 0) {
    logger.warn({ orderId }, 'Candidates list is empty');
    await handleNoShipperFound({ payload: { orderId }, metadata: { correlationId } });
    return;
  }

  const current = candidates.shift();
  await redis.set(candidatesKey, JSON.stringify(candidates), 'EX', 300);

  const { shipperId, distanceMeters, durationSeconds, coordinates } = current;

  // Fetch full details
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  const shipper = await prisma.shipper.findUnique({ where: { id: shipperId } });

  if (!order || !shipper) {
    logger.error({ orderId, shipperId }, 'Order or shipper not found during offer flow');
    return;
  }

  // Update order status to WAITING_ACCEPTANCE
  await prisma.order.update({
    where: { id: orderId },
    data: { status: 'WAITING_ACCEPTANCE' },
  });

  // Lock order with pending key for 30s
  const pendingKey = `order:pending_accept:${orderId}`;
  await redis.set(pendingKey, shipperId, 'EX', 30);

  // Store offer meta in Redis to retrieve later
  const offerMetaKey = `order:offer_meta:${orderId}`;
  await redis.set(offerMetaKey, JSON.stringify({
    distanceMeters,
    durationSeconds,
  }), 'EX', 60);

  // Cache route geometry (TTL = duration * 2)
  const routeKey = `tracking:route:${orderId}`;
  const ttl = Math.ceil(durationSeconds * 2);
  await redis.set(routeKey, JSON.stringify(coordinates), 'EX', ttl);

  // Send message offer
  await notificationService.sendOrderOffer(shipper, {
    ...order,
    distance: distanceMeters,
    duration: durationSeconds,
  } as any);

  // 30s timeout handler
  setTimeout(async () => {
    try {
      const lockedShipperId = await redis.get(pendingKey);
      if (lockedShipperId === shipperId) {
        logger.info({ orderId, shipperId }, 'Confirmation timeout reached (30s) — Triggering auto-reject');
        await notificationService.sendTimeoutNotice(shipper, orderId);
        await handleShipperResponse(orderId, shipperId, 'reject', correlationId);
      }
    } catch (err) {
      logger.error({ err, orderId, shipperId }, 'Error in 30s timeout handler');
    }
  }, 30000);
}

/**
 * Handle accept/reject responses from the shipper.
 */
export async function handleShipperResponse(
  orderId: string,
  shipperId: string,
  action: 'accept' | 'reject',
  correlationId?: string
): Promise<{ success: boolean; error?: string }> {
  const currentCorrelationId = correlationId || ulid();
  const pendingKey = `order:pending_accept:${orderId}`;

  // 1. Check pending key validity
  const lockedShipperId = await redis.get(pendingKey);
  if (!lockedShipperId) {
    logger.warn({ orderId, shipperId, action }, 'No pending offer found or offer has expired');
    return { success: false, error: 'OFFER_EXPIRED' };
  }

  if (lockedShipperId !== shipperId) {
    logger.warn(
      { orderId, shipperId, lockedShipperId, action },
      'Unauthorized responder - does not match pending shipper'
    );
    return { success: false, error: 'UNAUTHORIZED_RESPONDER' };
  }

  // 2. Remove pending accept lock
  await redis.del(pendingKey);

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  const shipper = await prisma.shipper.findUnique({ where: { id: shipperId } });
  if (!order || !shipper) {
    return { success: false, error: 'ORDER_OR_SHIPPER_NOT_FOUND' };
  }

  if (action === 'accept') {
    // 🟢 Case ACCEPT:
    logger.info({ orderId, shipperId }, 'Shipper accepted order offer');

    // Update order status to ASSIGNED in DB
    await prisma.order.update({
      where: { id: orderId },
      data: {
        status: 'ASSIGNED',
        shipperId,
      },
    });

    // Mark shipper as busy in Redis
    await markShipperBusy(shipperId);

    // Fetch and clear offer meta
    const offerMetaKey = `order:offer_meta:${orderId}`;
    const metaJson = await redis.get(offerMetaKey);
    let distanceMeters = 1000;
    let durationSeconds = 120;
    if (metaJson) {
      const meta = JSON.parse(metaJson);
      distanceMeters = meta.distanceMeters;
      durationSeconds = meta.durationSeconds;
    }
    await redis.del(offerMetaKey);

    // Publish order.assigned to Kafka
    const assignedEvent = {
      version: 1 as const,
      eventType: 'order.assigned' as const,
      payload: {
        orderId,
        shipperId,
        distanceMeters,
        durationSeconds,
        assignedAt: new Date().toISOString(),
      },
      metadata: {
        correlationId: currentCorrelationId,
        timestamp: new Date().toISOString(),
      },
    };

    await producer.send({
      topic: KAFKA_TOPICS.ORDER_ASSIGNED,
      messages: [
        {
          key: orderId,
          value: JSON.stringify(assignedEvent),
        },
      ],
    });

    // Clean candidates list and retry keys
    await redis.del(`order:candidates:${orderId}`);
    await redis.del(`order:retry:${orderId}`);

    // Send accept notification
    await notificationService.sendAcceptConfirm(shipper, order);

    return { success: true };
  } else {
    // 🔴 Case REJECT:
    logger.info({ orderId, shipperId }, 'Shipper rejected order offer');

    // Cooldown shipper for 15 mins (900 seconds)
    const cooldownKey = `shipper:cooldown:${shipperId}`;
    await redis.set(cooldownKey, '1', 'EX', 900);

    // Clean up offer meta
    await redis.del(`order:offer_meta:${orderId}`);

    // Send reject notification (skip if auto-timeout has already run)
    await notificationService.sendRejectConfirm(shipper, orderId);

    // Try next candidate
    await offerOrderToNextCandidate(orderId, currentCorrelationId);

    return { success: true };
  }
}

/**
 * Handle retry logic when no shipper is found.
 */
async function handleNoShipperFound(event: any): Promise<void> {
  const { orderId } = event.payload;
  const retryKey = `order:retry:${orderId}`;
  
  const retries = parseInt((await redis.get(retryKey)) || '0', 10);

  if (retries < 3) {
    await redis.set(retryKey, (retries + 1).toString(), 'EX', 300);
    logger.warn(
      { orderId, attempt: retries + 1 },
      'No shipper available. Scheduling retry in 30 seconds',
    );

    // Schedule retry async
    setTimeout(async () => {
      try {
        await dispatchOrder(event);
      } catch (err) {
        logger.error({ err, orderId }, 'Failed during dispatch retry attempt');
      }
    }, 30000);
  } else {
    logger.error(
      { orderId },
      'Max dispatch attempts reached. No shippers available for this order.',
    );
    await orderService.setOrderNoShipper(orderId);
    await redis.del(retryKey);
  }
}

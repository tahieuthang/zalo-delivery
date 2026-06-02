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

/**
 * Key pattern standard document:
 * Dedup:     webhook:dedup:{id}
 * Geo:       shipper:locations
 * Busy set:  shipper:busy
 * Route:     tracking:route:{orderId}
 * Retry:     order:retry:{orderId}
 */

/**
 * Select nearest shipper candidate, calculate driving route using OSRM, and assign the order.
 */
export async function dispatchOrder(event: any): Promise<void> {
  const { orderId, pickupLat, pickupLng } = event.payload;
  const correlationId = event.metadata?.correlationId || ulid();

  logger.info({ orderId, pickupLat, pickupLng }, 'Starting dispatcher search for nearest shipper');

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

  // 2. Filter out busy shippers and compute driving route using OSRM
  for (const [shipperId] of candidates) {
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

  // 3. Choose the best candidate (nearest by OSRM driving duration)
  if (eligibleCandidates.length === 0) {
    logger.warn({ orderId }, 'No eligible (free) shippers found after filtering');
    await handleNoShipperFound(event);
    return;
  }

  // Sort candidates by driving duration ascending
  eligibleCandidates.sort((a, b) => a.durationSeconds - b.durationSeconds);
  const best = eligibleCandidates[0];

  logger.info(
    { orderId, shipperId: best.shipperId, duration: best.durationSeconds },
    'Best shipper candidate selected',
  );

  // 4. Assign the order to the selected shipper
  // DB Update
  await orderService.assignOrder(orderId, best.shipperId);

  // Lock shipper status as busy in Redis
  await markShipperBusy(best.shipperId);

  // Cache route geometry coordinates in Redis (TTL = estimated duration * 2)
  const routeKey = `tracking:route:${orderId}`;
  const ttl = Math.ceil(best.durationSeconds * 2);
  await redis.set(routeKey, JSON.stringify(best.coordinates), 'EX', ttl);

  // 5. Publish order.assigned event to Kafka
  const assignedEvent = {
    version: 1 as const,
    eventType: 'order.assigned' as const,
    payload: {
      orderId,
      shipperId: best.shipperId,
      distanceMeters: best.distanceMeters,
      durationSeconds: best.durationSeconds,
      assignedAt: new Date().toISOString(),
    },
    metadata: {
      correlationId,
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

  // Clean retry counter if any
  await redis.del(`order:retry:${orderId}`);

  logger.info({ orderId, shipperId: best.shipperId, correlationId }, 'Order successfully assigned to shipper');
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
    }, 30000); // 30 seconds
  } else {
    logger.error(
      { orderId },
      'Max dispatch attempts reached. No shippers available for this order.',
    );
    await orderService.setOrderNoShipper(orderId);
    await redis.del(retryKey);
  }
}

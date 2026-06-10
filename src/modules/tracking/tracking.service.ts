import { prisma } from '@infra/database/prisma-client';
import { redis } from '@infra/redis/redis-client';
import { markShipperFree, getShipperLocation } from '@infra/redis/geo.service';
import { notificationService } from '@infra/notification';
import { producer } from '@infra/kafka/producer';
import { KAFKA_TOPICS } from '@infra/kafka/topics';
import logger from '@shared/logger/logger';
import { ulid } from '@shared/utils/id-generator';
import { AppError } from '@shared/errors/app-error';
import { ErrorCode } from '@shared/errors/error-codes';
import * as trackingRepo from '@modules/tracking/tracking.repository';

export function getHaversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) *
    Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export async function processGeofencing(
  shipperId: string,
  orderId: string,
  lat: number,
  lng: number
): Promise<void> {
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { shipper: true }
    });

    if (!order) {
      logger.warn({ orderId }, 'Order not found in processGeofencing');
      return;
    }

    if (!order.shipper) {
      logger.warn({ orderId }, 'Order has no assigned shipper in processGeofencing');
      return;
    }

    if (order.status === 'ASSIGNED') {
      if (order.pickupLat === null || order.pickupLng === null) return;
      const distanceToPickup = getHaversineDistance(lat, lng, order.pickupLat, order.pickupLng);

      logger.debug(
        { orderId, shipperId, distanceToPickup },
        'Checking distance to pickup location'
      );

      if (distanceToPickup <= 20) {
        logger.info({ orderId, shipperId }, 'Shipper reached pickup location. Transitioning to DELIVERING.');

        // 1. Update status in database
        await prisma.order.update({
          where: { id: orderId },
          data: { status: 'DELIVERING' }
        });

        // 2. Notify shipper
        await notificationService.sendDeliveringStatus(order.shipper, orderId);

        // 3. Broadcast status change via Socket.io
        require('@infra/socket').emitToOrderRoom(orderId, 'order:status_change', {
          orderId,
          status: 'DELIVERING'
        });
      }
    } else if (order.status === 'DELIVERING') {
      if (order.deliveryLat === null || order.deliveryLng === null) return;
      const distanceToDelivery = getHaversineDistance(lat, lng, order.deliveryLat, order.deliveryLng);

      logger.debug(
        { orderId, shipperId, distanceToDelivery },
        'Checking distance to delivery location'
      );

      if (distanceToDelivery <= 20) {
        logger.info({ orderId, shipperId }, 'Shipper reached delivery location. Transitioning to SUCCESS.');

        // 1. Update status in database
        const completedAt = new Date();
        await prisma.order.update({
          where: { id: orderId },
          data: {
            status: 'SUCCESS',
            completedAt
          }
        });

        // 2. Free the shipper in Redis and delete route cache
        await markShipperFree(shipperId);
        await redis.del(`tracking:route:${orderId}`);

        // 3. Notify shipper
        await notificationService.sendSuccessStatus(order.shipper, orderId);

        // 4. Broadcast status change via Socket.io
        require('@infra/socket').emitToOrderRoom(orderId, 'order:status_change', {
          orderId,
          status: 'SUCCESS'
        });

        // 5. Publish order.completed event to Kafka
        const completedEvent = {
          version: 1 as const,
          eventType: 'order.completed' as const,
          payload: {
            orderId,
            shipperId,
            amount: 30000, // Flat fee for the MVP delivery
            completedAt: completedAt.toISOString()
          },
          metadata: {
            correlationId: ulid(),
            timestamp: new Date().toISOString()
          }
        };

        await producer.send({
          topic: KAFKA_TOPICS.ORDER_COMPLETED,
          messages: [
            {
              key: orderId,
              value: JSON.stringify(completedEvent)
            }
          ]
        });

        logger.info({ orderId, shipperId }, 'Published order.completed event to Kafka');
      }
    }
  } catch (err) {
    logger.error({ err, orderId, shipperId }, 'Error processing geofencing and order completion');
  }
}

/**
 * Retrieve trajectory history for an order.
 */
export async function getTrajectoryByOrderId(orderId: string) {
  const orderExists = await prisma.order.findUnique({
    where: { id: orderId, deletedAt: null },
  });
  if (!orderExists) {
    throw new AppError(404, ErrorCode.ORDER_NOT_FOUND, `Không tìm thấy đơn hàng với ID: ${orderId}`);
  }

  const points = await trackingRepo.findByOrderId(orderId);
  return points.map((p) => ({
    lat: p.lat,
    lng: p.lng,
    createdAt: p.createdAt.toISOString(),
  }));
}

/**
 * Retrieve live tracking snapshot for an order.
 */
export async function getLiveTracking(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId, deletedAt: null },
    include: { shipper: true },
  });

  if (!order) {
    throw new AppError(404, ErrorCode.ORDER_NOT_FOUND, `Không tìm thấy đơn hàng với ID: ${orderId}`);
  }

  if (order.status !== 'ASSIGNED' && order.status !== 'DELIVERING') {
    throw new AppError(
      400,
      ErrorCode.INVALID_INPUT,
      'Theo dõi trực tuyến chỉ khả dụng cho đơn hàng ở trạng thái ASSIGNED hoặc DELIVERING',
    );
  }

  if (!order.shipperId) {
    throw new AppError(
      400,
      ErrorCode.INVALID_INPUT,
      'Đơn hàng chưa được gán shipper để theo dõi trực tuyến',
    );
  }

  const location = await getShipperLocation(order.shipperId);

  return {
    orderId: order.id,
    status: order.status,
    deliveryLat: order.deliveryLat,
    deliveryLng: order.deliveryLng,
    shipperName: order.shipper?.name || null,
    shipperLocation: location,
  };
}

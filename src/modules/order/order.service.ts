import { ulid } from '@shared/utils/id-generator';
import { AppError } from '@shared/errors/app-error';
import { ErrorCode } from '@shared/errors/error-codes';
import * as orderRepo from '@modules/order/order.repository';
import type { CreateOrderInput, OrderResponse, OrderStatus } from '@modules/order/order.types';
import { geocode } from '@infra/geocoding/geocoding.service';
import { producer } from '@infra/kafka/producer';
import { KAFKA_TOPICS } from '@infra/kafka/topics';
import logger from '@shared/logger/logger';

/**
 * Creates a new order by geocoding addresses, saving to PostgreSQL, and publishing a Kafka event.
 */
export async function createOrder(input: CreateOrderInput): Promise<OrderResponse> {
  logger.info({ customerId: input.customerId }, 'Processing order creation');

  // 1. Geocode pickup and delivery addresses to coordinates
  const pickupCoords = await geocode(input.pickupAddress);
  if (!pickupCoords) {
    logger.warn({ address: input.pickupAddress }, 'Failed to geocode pickup address');
    throw new AppError(
      400,
      ErrorCode.PARSE_FAILED,
      `Không thể định vị địa chỉ lấy hàng: ${input.pickupAddress}`,
    );
  }

  const deliveryCoords = await geocode(input.deliveryAddress);
  if (!deliveryCoords) {
    logger.warn({ address: input.deliveryAddress }, 'Failed to geocode delivery address');
    throw new AppError(
      400,
      ErrorCode.PARSE_FAILED,
      `Không thể định vị địa chỉ giao hàng: ${input.deliveryAddress}`,
    );
  }

  // 2. Generate ID and save the order in PostgreSQL
  const orderId = ulid();
  const order = await orderRepo.create({
    id: orderId,
    customerId: input.customerId,
    pickupAddress: input.pickupAddress,
    pickupLat: pickupCoords.lat,
    pickupLng: pickupCoords.lng,
    deliveryAddress: input.deliveryAddress,
    deliveryLat: deliveryCoords.lat,
    deliveryLng: deliveryCoords.lng,
    status: 'PENDING',
    note: input.note || null,
  });

  logger.info({ orderId: order.id }, 'Order saved in PostgreSQL database');

  // 3. Publish order.created event to Kafka
  const correlationId = ulid();
  const eventPayload = {
    version: 1 as const,
    eventType: 'order.created' as const,
    payload: {
      orderId: order.id,
      customerId: order.customerId,
      pickupAddress: order.pickupAddress,
      pickupLat: order.pickupLat!,
      pickupLng: order.pickupLng!,
      deliveryAddress: order.deliveryAddress,
      deliveryLat: order.deliveryLat!,
      deliveryLng: order.deliveryLng!,
      createdAt: order.createdAt.toISOString(),
    },
    metadata: {
      correlationId,
      timestamp: new Date().toISOString(),
    },
  };

  try {
    await producer.send({
      topic: KAFKA_TOPICS.ORDER_CREATED,
      messages: [
        {
          key: order.id,
          value: JSON.stringify(eventPayload),
        },
      ],
    });
    logger.info({ orderId: order.id, correlationId }, 'Published order.created Kafka event');
  } catch (err) {
    logger.error({ err, orderId: order.id }, 'Failed to publish order.created event to Kafka');
  }

  return {
    id: order.id,
    customerId: order.customerId,
    pickupAddress: order.pickupAddress,
    pickupLat: order.pickupLat,
    pickupLng: order.pickupLng,
    deliveryAddress: order.deliveryAddress,
    deliveryLat: order.deliveryLat,
    deliveryLng: order.deliveryLng,
    status: order.status as OrderStatus,
    note: order.note,
    createdAt: order.createdAt.toISOString(),
  };
}

/**
 * Retrieve order details by ID.
 */
export async function getOrderById(id: string): Promise<OrderResponse> {
  const order = await orderRepo.findById(id);
  if (!order) {
    throw new AppError(404, ErrorCode.ORDER_NOT_FOUND, `Không tìm thấy đơn hàng với ID: ${id}`);
  }

  return {
    id: order.id,
    customerId: order.customerId,
    pickupAddress: order.pickupAddress,
    pickupLat: order.pickupLat,
    pickupLng: order.pickupLng,
    deliveryAddress: order.deliveryAddress,
    deliveryLat: order.deliveryLat,
    deliveryLng: order.deliveryLng,
    status: order.status as OrderStatus,
    note: order.note,
    createdAt: order.createdAt.toISOString(),
  };
}

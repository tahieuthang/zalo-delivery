import { ulid } from '@shared/utils/id-generator';
import { AppError } from '@shared/errors/app-error';
import { ErrorCode } from '@shared/errors/error-codes';
import * as orderRepo from '@modules/order/order.repository';
import type { CreateOrderInput, OrderResponse, OrderStatus, OrderDetailResponse } from '@modules/order/order.types';
import { geocode } from '@infra/geocoding/geocoding.service';
import { producer } from '@infra/kafka/producer';
import { KAFKA_TOPICS } from '@infra/kafka/topics';
import logger from '@shared/logger/logger';

/**
 * Creates a new order by geocoding addresses, saving to PostgreSQL, and publishing a Kafka event.
 */
export async function createOrder(input: CreateOrderInput): Promise<OrderResponse> {
  const resolvedCustomerId = input.customerId || `guest_${ulid()}`;
  logger.info({ customerId: resolvedCustomerId }, 'Processing order creation');

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
    customerId: resolvedCustomerId,
    pickupAddress: input.pickupAddress,
    pickupLat: pickupCoords.lat,
    pickupLng: pickupCoords.lng,
    deliveryAddress: input.deliveryAddress,
    deliveryLat: deliveryCoords.lat,
    deliveryLng: deliveryCoords.lng,
    status: 'PENDING',
    note: input.note || null,
    items: input.items ? (input.items as any) : null,
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
    items: order.items,
  };
}

/**
 * Retrieve order details by ID.
 */
export async function getOrderById(id: string): Promise<OrderDetailResponse> {
  const order = await orderRepo.findDetailedById(id);
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
    items: order.items,
    shipper: order.shipper
      ? {
        id: order.shipper.id,
        name: order.shipper.name,
        phone: order.shipper.phone,
        vehicleType: order.shipper.vehicleType,
      }
      : null,
    trajectoryCount: order._count.trajectory,
    revenues: order.revenues.map((r) => ({
      id: r.id,
      amount: r.amount,
      type: r.type,
      completedAt: r.completedAt.toISOString(),
      createdAt: r.createdAt.toISOString(),
    })),
    offerLogs: (order as any).offerLogs
      ? (order as any).offerLogs.map((log: any) => ({
        id: log.id,
        shipperId: log.shipperId,
        status: log.status,
        createdAt: log.createdAt.toISOString(),
        updatedAt: log.updatedAt.toISOString(),
        shipper: {
          id: log.shipperId,
          name: log.shipper.name,
          phone: log.shipper.phone,
        },
      }))
      : [],
  };
}

/**
 * Assign a shipper to an order and update status to ASSIGNED.
 */
export async function assignOrder(orderId: string, shipperId: string): Promise<void> {
  await orderRepo.update(orderId, {
    status: 'ASSIGNED',
    shipper: { connect: { id: shipperId } },
  });
  logger.info({ orderId, shipperId }, 'Order status updated to ASSIGNED in database');
}

/**
 * Set order status to NO_SHIPPER when dispatch fails.
 */
export async function setOrderNoShipper(orderId: string): Promise<void> {
  await orderRepo.update(orderId, {
    status: 'NO_SHIPPER',
  });
  logger.warn({ orderId }, 'Order status updated to NO_SHIPPER in database');
}

/**
 * Retrieve all orders matching filters with pagination.
 */
export async function getOrders(filter: {
  status?: string;
  shipperId?: string;
  from?: string;
  to?: string;
  page?: string | number;
  limit?: string | number;
} = {}) {
  const page = filter.page ? Math.max(1, parseInt(String(filter.page), 10) || 1) : 1;
  const limit = filter.limit ? Math.max(1, parseInt(String(filter.limit), 10) || 20) : 20;
  const skip = (page - 1) * limit;

  // Parse and validate statuses
  let statuses: OrderStatus[] | undefined;
  if (filter.status) {
    const validStatuses: OrderStatus[] = [
      'PENDING',
      'WAITING_ACCEPTANCE',
      'ASSIGNED',
      'DELIVERING',
      'SUCCESS',
      'FAILED',
      'NO_SHIPPER',
    ];
    statuses = filter.status
      .split(',')
      .map((s) => s.trim().toUpperCase() as OrderStatus)
      .filter((s) => validStatuses.includes(s));
  }

  // Parse dates
  const from = filter.from ? new Date(filter.from) : undefined;
  const to = filter.to ? new Date(filter.to) : undefined;

  if (from && isNaN(from.getTime())) {
    throw new AppError(400, ErrorCode.INVALID_INPUT, 'Tham số "from" không đúng định dạng ngày tháng');
  }
  if (to && isNaN(to.getTime())) {
    throw new AppError(400, ErrorCode.INVALID_INPUT, 'Tham số "to" không đúng định dạng ngày tháng');
  }

  const { total, data } = await orderRepo.findAndCount({
    statuses,
    shipperId: filter.shipperId,
    from,
    to,
    skip,
    take: limit,
  });

  const totalPages = Math.ceil(total / limit);

  return {
    data: data.map((order) => ({
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
      items: order.items,
    })),
    meta: {
      total,
      page,
      limit,
      totalPages,
    },
  };
}



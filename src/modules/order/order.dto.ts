import { z } from 'zod';

export const CreateOrderDto = z.object({
  customerId: z.string().min(1),
  pickupAddress: z.string().min(3),
  deliveryAddress: z.string().min(3),
  note: z.string().optional(),
});

export const OrderResponseDto = z.object({
  id: z.string(),
  customerId: z.string(),
  pickupAddress: z.string(),
  pickupLat: z.number().nullable(),
  pickupLng: z.number().nullable(),
  deliveryAddress: z.string(),
  deliveryLat: z.number().nullable(),
  deliveryLng: z.number().nullable(),
  status: z.enum(['PENDING', 'ASSIGNED', 'DELIVERING', 'SUCCESS', 'FAILED', 'NO_SHIPPER']),
  note: z.string().nullable(),
  createdAt: z.string(),
});

// Event Schema for order.created Kafka event (Version 1)
export const OrderCreatedEventSchema = z.object({
  version: z.literal(1),
  eventType: z.literal('order.created'),
  payload: z.object({
    orderId: z.string(),
    customerId: z.string(),
    pickupAddress: z.string(),
    pickupLat: z.number(),
    pickupLng: z.number(),
    deliveryAddress: z.string(),
    deliveryLat: z.number(),
    deliveryLng: z.number(),
    createdAt: z.string().datetime(),
  }),
  metadata: z.object({
    correlationId: z.string(),
    timestamp: z.string().datetime(),
  }),
});

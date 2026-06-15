import { z } from 'zod';

export const CreateOrderDto = z.object({
  customerId: z.string().optional(),
  pickupAddress: z.string().min(3),
  deliveryAddress: z.string().min(3),
  note: z.string().optional(),
  items: z.array(z.object({
    name: z.string(),
    quantity: z.number(),
    note: z.string().optional(),
  })).optional(),
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
  status: z.enum([
    'PENDING',
    'WAITING_ACCEPTANCE',
    'ASSIGNED',
    'DELIVERING',
    'SUCCESS',
    'FAILED',
    'NO_SHIPPER',
  ]),
  note: z.string().nullable(),
  createdAt: z.string(),
  items: z.any().nullable().optional(), // Using z.any() for easy handling of Json fields from Prisma
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

export const OrderDetailResponseDto = OrderResponseDto.extend({
  shipper: z
    .object({
      id: z.string(),
      name: z.string(),
      phone: z.string(),
      vehicleType: z.string(),
    })
    .nullable(),
  trajectoryCount: z.number(),
  revenues: z.array(
    z.object({
      id: z.string(),
      amount: z.number(),
      type: z.string(),
      completedAt: z.string(),
      createdAt: z.string(),
    }),
  ),
  offerLogs: z.array(
    z.object({
      id: z.string(),
      shipperId: z.string(),
      status: z.enum(['PENDING', 'ACCEPTED', 'REJECTED', 'TIMEOUT']),
      createdAt: z.string(),
      updatedAt: z.string(),
      shipper: z.object({
        id: z.string(),
        name: z.string(),
        phone: z.string(),
      }),
    }),
  ),
});

import { z } from 'zod';

export const OrderAssignedEventSchema = z.object({
  version: z.literal(1),
  eventType: z.literal('order.assigned'),
  payload: z.object({
    orderId: z.string(),
    shipperId: z.string(),
    distanceMeters: z.number(),
    durationSeconds: z.number(),
    assignedAt: z.string().datetime(),
  }),
  metadata: z.object({
    correlationId: z.string(),
    timestamp: z.string().datetime(),
  }),
});

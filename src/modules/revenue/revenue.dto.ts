import { z } from 'zod';

export const OrderCompletedEventSchema = z.object({
  version: z.literal(1),
  eventType: z.literal('order.completed'),
  payload: z.object({
    orderId: z.string(),
    shipperId: z.string(),
    amount: z.number().positive(),
    completedAt: z.string().datetime(),
  }),
  metadata: z.object({
    correlationId: z.string(),
    timestamp: z.string().datetime(),
  }),
});

export type OrderCompletedEvent = z.infer<typeof OrderCompletedEventSchema>;

export const DailyRevenueQuerySchema = z.object({
  from: z.string().optional().refine((val) => !val || !isNaN(Date.parse(val)), {
    message: 'Invalid date format for "from"',
  }),
  to: z.string().optional().refine((val) => !val || !isNaN(Date.parse(val)), {
    message: 'Invalid date format for "to"',
  }),
});


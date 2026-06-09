import { z } from 'zod';
import {
  CreateOrderDto,
  OrderResponseDto,
  OrderCreatedEventSchema,
  OrderDetailResponseDto,
} from '@modules/order/order.dto';

export type CreateOrderInput = z.infer<typeof CreateOrderDto>;
export type OrderResponse = z.infer<typeof OrderResponseDto>;
export type OrderCreatedEvent = z.infer<typeof OrderCreatedEventSchema>;
export type OrderDetailResponse = z.infer<typeof OrderDetailResponseDto>;

import { OrderStatus } from '@prisma/client';
export { OrderStatus };

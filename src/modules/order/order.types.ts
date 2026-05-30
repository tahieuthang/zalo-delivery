import { z } from 'zod';
import { CreateOrderDto, OrderResponseDto, OrderCreatedEventSchema } from './order.dto';

export type CreateOrderInput = z.infer<typeof CreateOrderDto>;
export type OrderResponse = z.infer<typeof OrderResponseDto>;
export type OrderCreatedEvent = z.infer<typeof OrderCreatedEventSchema>;

export type OrderStatus = 'PENDING' | 'ASSIGNED' | 'DELIVERING' | 'SUCCESS' | 'FAILED' | 'NO_SHIPPER';

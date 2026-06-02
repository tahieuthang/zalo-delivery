import { z } from 'zod';
import { OrderAssignedEventSchema } from '@modules/dispatcher/dispatcher.dto';

export type OrderAssignedEvent = z.infer<typeof OrderAssignedEventSchema>;
export type OrderAssignedPayload = OrderAssignedEvent['payload'];

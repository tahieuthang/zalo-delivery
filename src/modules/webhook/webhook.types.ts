import { z } from 'zod';
import { ZaloWebhookPayloadSchema } from '@modules/webhook/webhook.dto';

export type ZaloWebhookPayload = z.infer<typeof ZaloWebhookPayloadSchema>;

export interface ParsedOrder {
  name: string;
  phone: string;
  deliveryAddress: string;
  pickupAddress?: string;
  note?: string;
}

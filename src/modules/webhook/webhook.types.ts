import { z } from 'zod';
import { ZaloWebhookPayloadSchema } from '@modules/webhook/webhook.dto';

export type ZaloWebhookPayload = z.infer<typeof ZaloWebhookPayloadSchema>;

export interface ParsedOrderItem {
  name: string;
  quantity: number;
  note?: string;
}

export interface ParsedOrder {
  name: string;
  phone: string;
  deliveryAddress: string;
  pickupAddress?: string;
  note?: string;
  items?: ParsedOrderItem[];
}

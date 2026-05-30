import { z } from 'zod';

export const ZaloSenderSchema = z.object({
  id: z.string().min(1),
});

export const ZaloRecipientSchema = z.object({
  id: z.string().min(1),
});

export const ZaloMessageSchema = z.object({
  text: z.string(),
  msg_id: z.string().min(1),
});

export const ZaloWebhookPayloadSchema = z.object({
  app_id: z.string().min(1),
  sender: ZaloSenderSchema,
  user_id_by_app: z.string().optional(),
  recipient: ZaloRecipientSchema,
  event_name: z.string(),
  message: ZaloMessageSchema.optional(),
  timestamp: z.string().min(1),
});

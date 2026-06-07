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
  sender: ZaloSenderSchema.optional(),
  user_id_by_app: z.string().optional(),
  recipient: ZaloRecipientSchema.optional(),
  event_name: z.string(),
  message: ZaloMessageSchema.optional(),
  follower: z.object({
    id: z.string(),
  }).optional(),
  timestamp: z.string().min(1),
});

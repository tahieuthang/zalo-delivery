import { Router } from 'express';
import { webhookRouter } from './webhook.controller';

export const router = Router();
router.use('/webhooks', webhookRouter);

export async function initModule(): Promise<void> {
  // Webhook module initialization logic
}

export * from './webhook.types';
export * from './webhook.dto';
export * from './webhook.service';

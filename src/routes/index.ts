import { Router, Request, Response } from 'express';
import { router as webhookRouter, initModule as initWebhook } from '@modules/webhook';
import { router as orderRouter, initModule as initOrder } from '@modules/order';

export const router = Router();

// Health check
router.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Mount module routers
router.use(webhookRouter);
router.use(orderRouter);

// Initialize all modules
export async function initModules(): Promise<void> {
  await initWebhook();
  await initOrder();
}

import { Router, Request, Response } from 'express';
import { router as webhookRouter, initModule as initWebhook } from '@modules/webhook';
import { router as orderRouter, initModule as initOrder } from '@modules/order';
import { router as shipperRouter, initModule as initShipper } from '@modules/shipper';
import { router as dispatcherRouter, initModule as initDispatcher } from '@modules/dispatcher';
import { router as trackingRouter, initModule as initTracking } from '@modules/tracking';

export const router = Router();

// Health check
router.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Mount module routers
router.use(webhookRouter);
router.use(orderRouter);
router.use(shipperRouter);
router.use(dispatcherRouter);
router.use(trackingRouter);

// Initialize all modules
export async function initModules(): Promise<void> {
  await initWebhook();
  await initOrder();
  await initShipper();
  await initDispatcher();
  await initTracking();
}


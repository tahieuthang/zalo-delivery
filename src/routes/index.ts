import { Router } from 'express';

export const router = Router();

// Health check
router.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// TODO: Mount module routers here as modules are implemented
// import { router as webhookRouter, initModule as initWebhook } from '@modules/webhook';
// router.use(webhookRouter);

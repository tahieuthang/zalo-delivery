import { Router, Request, Response } from 'express';
import { router as webhookRouter, initModule as initWebhook } from '@modules/webhook';
import { router as orderRouter, initModule as initOrder } from '@modules/order';
import { router as shipperRouter, initModule as initShipper } from '@modules/shipper';
import { router as dispatcherRouter, initModule as initDispatcher } from '@modules/dispatcher';
import { router as trackingRouter, initModule as initTracking } from '@modules/tracking';
import { router as revenueRouter, initModule as initRevenue } from '@modules/revenue';
import { router as dashboardRouter, initModule as initDashboard } from '@modules/dashboard';
import { docsRouter } from '@infra/docs/swagger';
import { prisma } from '@infra/database/prisma-client';
import { redis } from '@infra/redis/redis-client';
import { kafka } from '@infra/kafka/kafka-client';

export const router = Router();

// Health check with dependency probes
router.get('/health', async (_req: Request, res: Response) => {
  const healthStatus: {
    status: 'ok' | 'error';
    timestamp: string;
    services: {
      database: 'up' | 'down';
      redis: 'up' | 'down';
      kafka: 'up' | 'down';
    };
  } = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {
      database: 'up',
      redis: 'up',
      kafka: 'up',
    },
  };

  // 1. Probe Database (PostgreSQL)
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    healthStatus.services.database = 'down';
    healthStatus.status = 'error';
  }

  // 2. Probe Redis
  try {
    const pingRes = await redis.ping();
    if (pingRes !== 'PONG') {
      healthStatus.services.redis = 'down';
      healthStatus.status = 'error';
    }
  } catch (err) {
    healthStatus.services.redis = 'down';
    healthStatus.status = 'error';
  }

  // 3. Probe Kafka
  try {
    const admin = kafka.admin();
    await admin.connect();
    await admin.listTopics();
    await admin.disconnect();
  } catch (err) {
    healthStatus.services.kafka = 'down';
    healthStatus.status = 'error';
  }

  const statusCode = healthStatus.status === 'ok' ? 200 : 503;
  res.status(statusCode).json(healthStatus);
});

// Mount module routers
router.use(docsRouter);
router.use(webhookRouter);
router.use(orderRouter);
router.use(shipperRouter);
router.use(dispatcherRouter);
router.use(trackingRouter);
router.use(revenueRouter);
router.use(dashboardRouter);


// Initialize all modules
export async function initModules(): Promise<void> {
  await initWebhook();
  await initOrder();
  await initShipper();
  await initDispatcher();
  await initTracking();
  await initRevenue();
  await initDashboard();
}



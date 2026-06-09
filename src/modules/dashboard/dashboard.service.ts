import { prisma } from '@infra/database/prisma-client';
import { redis } from '@infra/redis/redis-client';
import logger from '@shared/logger/logger';

const CACHE_KEY = 'dashboard:summary';
const CACHE_TTL = 30; // 30 seconds

/**
 * Retrieve aggregated statistics for the admin dashboard.
 * Uses Redis caching with a 30s TTL.
 */
export async function getDashboardSummary() {
  // 1. Try to fetch from Redis cache
  try {
    const cachedData = await redis.get(CACHE_KEY);
    if (cachedData) {
      logger.debug('Returning dashboard summary from Redis cache');
      return JSON.parse(cachedData);
    }
  } catch (err) {
    logger.warn({ err }, 'Failed to read dashboard summary from Redis cache');
  }

  logger.info('Computing dashboard summary from database');

  // 2. Compute metrics from DB in a transaction
  const [
    pendingCount,
    waitingAcceptanceCount,
    assignedCount,
    deliveringCount,
    successCount,
    failedCount,
    noShipperCount,
    onlineCount,
    offlineCount,
    busyCount,
    revenueSum,
  ] = await prisma.$transaction([
    prisma.order.count({ where: { status: 'PENDING', deletedAt: null } }),
    prisma.order.count({ where: { status: 'WAITING_ACCEPTANCE', deletedAt: null } }),
    prisma.order.count({ where: { status: 'ASSIGNED', deletedAt: null } }),
    prisma.order.count({ where: { status: 'DELIVERING', deletedAt: null } }),
    prisma.order.count({ where: { status: 'SUCCESS', deletedAt: null } }),
    prisma.order.count({ where: { status: 'FAILED', deletedAt: null } }),
    prisma.order.count({ where: { status: 'NO_SHIPPER', deletedAt: null } }),
    prisma.shipper.count({ where: { status: 'ONLINE', deletedAt: null } }),
    prisma.shipper.count({ where: { status: 'OFFLINE', deletedAt: null } }),
    prisma.shipper.count({ where: { status: 'BUSY', deletedAt: null } }),
    prisma.revenueRecord.aggregate({
      _sum: {
        amount: true,
      },
    }),
  ]);

  const summary = {
    orders: {
      PENDING: pendingCount,
      WAITING_ACCEPTANCE: waitingAcceptanceCount,
      ASSIGNED: assignedCount,
      DELIVERING: deliveringCount,
      SUCCESS: successCount,
      FAILED: failedCount,
      NO_SHIPPER: noShipperCount,
    },
    shippers: {
      ONLINE: onlineCount,
      OFFLINE: offlineCount,
      BUSY: busyCount,
    },
    totalRevenue: revenueSum._sum.amount || 0,
    computedAt: new Date().toISOString(),
  };

  // 3. Store in Redis cache
  try {
    await redis.set(CACHE_KEY, JSON.stringify(summary), 'EX', CACHE_TTL);
  } catch (err) {
    logger.warn({ err }, 'Failed to cache dashboard summary in Redis');
  }

  return summary;
}

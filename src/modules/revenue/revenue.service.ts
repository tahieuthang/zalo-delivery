import * as revenueRepo from '@modules/revenue/revenue.repository';
import { redis } from '@infra/redis/redis-client';
import logger from '@shared/logger/logger';

export async function processOrderCompleted(payload: {
  orderId: string;
  shipperId: string;
  amount: number;
  completedAt: string;
}) {
  logger.info({ orderId: payload.orderId, shipperId: payload.shipperId }, 'Processing order completed revenue record');
  
  const completedDate = new Date(payload.completedAt);
  const result = await revenueRepo.createRevenueAndIncrementEarnings({
    orderId: payload.orderId,
    shipperId: payload.shipperId,
    amount: payload.amount,
    completedAt: completedDate,
  });

  // Invalidate cache
  try {
    await redis.del('revenue:summary');
    const keys = await redis.keys('revenue:daily:*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }
    logger.info('Invalidated revenue caches in Redis');
  } catch (err) {
    logger.error({ err }, 'Failed to clear revenue cache in Redis');
  }

  return result;
}

export async function getRevenueSummary() {
  const cacheKey = 'revenue:summary';
  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      logger.debug('Returning cached revenue summary');
      return JSON.parse(cached);
    }
  } catch (err) {
    logger.warn({ err }, 'Failed to read revenue summary cache from Redis');
  }

  const result = await revenueRepo.getRevenueSummary();

  try {
    await redis.set(cacheKey, JSON.stringify(result), 'EX', 300); // 5 minutes TTL
  } catch (err) {
    logger.error({ err }, 'Failed to write revenue summary cache to Redis');
  }

  return result;
}

export async function getRevenueByShipper(shipperId: string) {
  return revenueRepo.getRevenueByShipper(shipperId);
}

export async function getDailyRevenue(fromStr?: string, toStr?: string) {
  const from = fromStr ? new Date(fromStr) : undefined;
  const to = toStr ? new Date(toStr) : undefined;

  const cacheKey = `revenue:daily:${fromStr || 'all'}:${toStr || 'all'}`;
  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      logger.debug('Returning cached daily revenue');
      return JSON.parse(cached);
    }
  } catch (err) {
    logger.warn({ err }, 'Failed to read daily revenue cache from Redis');
  }

  const result = await revenueRepo.getDailyRevenue(from, to);

  try {
    await redis.set(cacheKey, JSON.stringify(result), 'EX', 300); // 5 minutes TTL
  } catch (err) {
    logger.error({ err }, 'Failed to write daily revenue cache to Redis');
  }

  return result;
}

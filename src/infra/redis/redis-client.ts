import Redis from 'ioredis';
import { env } from '@config/env.config';
import logger from '@shared/logger/logger';

export const redis = new Redis({
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  lazyConnect: true,
  retryStrategy: (times) => {
    if (times > 5) return null; // Stop retrying
    return Math.min(times * 500, 2000);
  },
});

redis.on('connect', () => logger.info('Redis connected'));
redis.on('error', (err) => logger.error({ err }, 'Redis error'));

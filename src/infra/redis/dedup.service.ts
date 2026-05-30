import { redis } from './redis-client';

/**
 * Key pattern: {namespace}:dedup:{id}
 * Dùng SET NX EX — atomic, tránh race condition
 * @returns true nếu message là MỚI (chưa thấy bao giờ)
 */
export async function isNew(
  namespace: string,
  id: string,
  ttlSeconds = 86400,
): Promise<boolean> {
  const result = await redis.set(
    `${namespace}:dedup:${id}`,
    '1',
    'EX',
    ttlSeconds,
    'NX',
  );
  return result === 'OK';
}

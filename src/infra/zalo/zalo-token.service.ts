import { redis } from '@infra/redis/redis-client';
import { env } from '@config/env.config';
import logger from '@shared/logger/logger';
import { z } from 'zod';

const ZaloTokenResponseSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  expires_in: z.coerce.number(),
});

export async function getAccessToken(): Promise<string> {
  // 1. Try to read from Redis
  try {
    const cachedToken = await redis.get('zalo:oa:access_token');
    if (cachedToken) {
      return cachedToken;
    }
  } catch (err) {
    logger.error({ err }, 'Failed to read Zalo access token from Redis');
  }

  // 2. If not found, refresh token
  return refreshAccessToken();
}

export async function refreshAccessToken(): Promise<string> {
  logger.info('Refreshing Zalo OA Access Token...');

  const appId = env.ZALO_APP_ID;
  const secretKey = env.ZALO_OA_SECRET_KEY || env.ZALO_APP_SECRET;
  
  // Get refresh token from Redis, fallback to env
  let refreshToken: string | null = null;
  try {
    refreshToken = await redis.get('zalo:oa:refresh_token');
  } catch (err) {
    logger.error({ err }, 'Failed to read Zalo refresh token from Redis');
  }
  
  if (!refreshToken) {
    refreshToken = env.ZALO_OA_REFRESH_TOKEN || '';
  }

  if (!appId || !secretKey || !refreshToken) {
    logger.warn(
      'Zalo OA configuration missing (ZALO_APP_ID, ZALO_OA_SECRET_KEY, or ZALO_OA_REFRESH_TOKEN). Using env fallback.'
    );
    return env.ZALO_OA_ACCESS_TOKEN || '';
  }

  const url = 'https://oauth.zaloapp.com/v4/oa/access_token';
  const bodyParams = new URLSearchParams({
    refresh_token: refreshToken,
    app_id: appId,
    grant_type: 'refresh_token',
  });

  let retries = 2;
  while (retries >= 0) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'secret_key': secretKey,
        },
        body: bodyParams.toString(),
        signal: AbortSignal.timeout(5000), // 5s timeout
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Zalo OAuth API returned status ${response.status}: ${errorText}`);
      }

      const json = await response.json();
      const parsed = ZaloTokenResponseSchema.parse(json);

      // Cache new tokens in Redis
      const ttl = parsed.expires_in - 300;
      await redis.set('zalo:oa:access_token', parsed.access_token, 'EX', Math.max(ttl, 60));
      await redis.set('zalo:oa:refresh_token', parsed.refresh_token);

      logger.info('Zalo OA Access Token refreshed and cached successfully');
      return parsed.access_token;
    } catch (err) {
      logger.error({ err, retries }, 'Failed to refresh Zalo OA Access Token');
      if (retries === 0) {
        // Fallback to initial config token if everything fails
        return env.ZALO_OA_ACCESS_TOKEN || '';
      }
      retries--;
      await new Promise((resolve) => setTimeout(resolve, 1000)); // wait 1s before retry
    }
  }

  return env.ZALO_OA_ACCESS_TOKEN || '';
}

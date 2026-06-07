import { getAccessToken, refreshAccessToken } from './zalo-token.service';
import logger from '@shared/logger/logger';
import { z } from 'zod';

const ZaloOaResponseSchema = z.object({
  error: z.coerce.number(),
  message: z.string(),
  data: z.any().optional(),
});

export async function sendOaMessage(payload: any): Promise<void> {
  const url = 'https://openapi.zalo.me/v3.0/oa/message/cs';
  let accessToken = await getAccessToken();

  let retries = 2;
  while (retries >= 0) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'access_token': accessToken,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5000), // 5s timeout
      });

      if (!response.ok) {
        throw new Error(`Zalo OA Client HTTP error: ${response.status}`);
      }

      const json = await response.json();
      const result = ZaloOaResponseSchema.parse(json);

      if (result.error !== 0) {
        // -216 or other codes represent expired or invalid access tokens in Zalo OA
        if ([-216, -210, -201, -202].includes(result.error) && retries > 0) {
          logger.warn(
            { errorCode: result.error, message: result.message },
            'Zalo token invalid or expired. Triggering token refresh...'
          );
          accessToken = await refreshAccessToken();
          retries--;
          continue;
        }
        
        throw new Error(`Zalo OA API returned error [${result.error}]: ${result.message}`);
      }

      logger.info({ messageId: result.data?.message_id }, 'Zalo OA message transmitted successfully');
      return;
    } catch (err) {
      logger.error({ err, retries }, 'Error sending Zalo OA message');
      if (retries === 0) {
        throw err;
      }
      retries--;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}

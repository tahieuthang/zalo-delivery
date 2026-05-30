import logger from '../logger/logger';

interface RetryOptions {
  maxAttempts?: number;
  delayMs?: number;
  backoff?: boolean;
}

/**
 * Generic retry helper với exponential backoff tùy chọn
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const { maxAttempts = 3, delayMs = 1000, backoff = true } = options;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) {
        const waitMs = backoff ? delayMs * attempt : delayMs;
        logger.warn({ attempt, maxAttempts, waitMs }, 'Retrying after error');
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
    }
  }

  throw lastError;
}

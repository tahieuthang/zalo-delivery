import { kafka } from './kafka-client';
import logger from '@shared/logger/logger';

export function createConsumer(groupId: string) {
  return kafka.consumer({ groupId });
}

/**
 * Subscribe và chạy consumer với error handling chuẩn
 */
export async function runConsumer(
  groupId: string,
  topic: string,
  handler: (message: Record<string, unknown>) => Promise<void>,
): Promise<() => Promise<void>> {
  const consumer = createConsumer(groupId);
  await consumer.connect();
  await consumer.subscribe({ topic, fromBeginning: true });

  await consumer.run({
    eachMessage: async ({ topic: t, partition, message }) => {
      const raw = message.value?.toString();
      if (!raw) return;

      try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        await handler(parsed);
      } catch (err) {
        logger.error({ err, topic: t, partition, offset: message.offset }, 'Consumer handler error');
        // TODO: implement DLQ logic
      }
    },
  });

  logger.info({ groupId, topic }, 'Kafka consumer running');

  return async () => {
    await consumer.disconnect();
  };
}

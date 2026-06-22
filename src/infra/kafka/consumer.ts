import { kafka } from '@infra/kafka/kafka-client';
import { producer } from '@infra/kafka/producer';
import logger from '@shared/logger/logger';


export function createConsumer(groupId: string) {
  return kafka.consumer({ groupId });
}

/**
 * Subscribe và chạy consumer với error handling chuẩn và Dead Letter Queue (DLQ)
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
      } catch (err: any) {
        logger.error({ err, topic: t, partition, offset: message.offset }, 'Consumer handler error');

        // Dead Letter Queue (DLQ) logic
        try {
          const dlqTopic = `${t}.dlq`;
          const dlqPayload = {
            originalTopic: t,
            partition,
            offset: message.offset,
            key: message.key?.toString() || null,
            value: raw,
            error: {
              message: err?.message || String(err),
              stack: err?.stack || null,
            },
            timestamp: new Date().toISOString(),
          };

          await producer.send({
            topic: dlqTopic,
            messages: [
              {
                key: message.key || undefined,
                value: JSON.stringify(dlqPayload),
              },
            ],
          });
          logger.warn({ dlqTopic, offset: message.offset }, 'Successfully sent failed message to DLQ');
        } catch (dlqErr) {
          logger.error({ err: dlqErr }, 'Failed to publish message to DLQ');
        }
      }
    },
  });

  logger.info({ groupId, topic }, 'Kafka consumer running');

  return async () => {
    await consumer.disconnect();
  };
}


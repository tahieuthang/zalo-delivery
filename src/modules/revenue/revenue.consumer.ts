import { runConsumer } from '@infra/kafka/consumer';
import { KAFKA_TOPICS } from '@infra/kafka/topics';
import { OrderCompletedEventSchema } from '@modules/revenue/revenue.dto';
import * as revenueService from '@modules/revenue/revenue.service';

import logger from '@shared/logger/logger';

let shutdownFn: (() => Promise<void>) | null = null;

/**
 * Start the Kafka consumer for the revenue module.
 */
export async function startRevenueConsumer(): Promise<void> {
  const groupId = 'revenue-service';

  logger.info({ topic: KAFKA_TOPICS.ORDER_COMPLETED, groupId }, 'Registering revenue consumer');

  shutdownFn = await runConsumer(groupId, KAFKA_TOPICS.ORDER_COMPLETED, async (message) => {
    try {
      // Validate incoming message structure using OrderCompletedEventSchema
      const validatedEvent = OrderCompletedEventSchema.parse(message);
      
      logger.info(
        { orderId: validatedEvent.payload.orderId, correlationId: validatedEvent.metadata.correlationId },
        'Received order.completed Kafka event in revenue consumer',
      );

      // Pass event to service to process revenue record and update shipper earnings
      await revenueService.processOrderCompleted(validatedEvent.payload);
    } catch (err) {
      logger.error({ err, rawMessage: message }, 'Failed to process order.completed event');
    }
  });
}

/**
 * Stop the revenue consumer gracefully on application shutdown.
 */
export async function stopRevenueConsumer(): Promise<void> {
  if (shutdownFn) {
    logger.info('Stopping revenue consumer');
    await shutdownFn();
    shutdownFn = null;
  }
}

import { runConsumer } from '@infra/kafka/consumer';
import { KAFKA_TOPICS } from '@infra/kafka/topics';
import { OrderCreatedEventSchema } from '@modules/order/order.dto';
import * as dispatcherService from '@modules/dispatcher/dispatcher.service';
import logger from '@shared/logger/logger';

let shutdownFn: (() => Promise<void>) | null = null;

/**
 * Start the Kafka consumer for the dispatcher module.
 */
export async function startDispatcherConsumer(): Promise<void> {
  const groupId = 'dispatcher-service';

  logger.info({ topic: KAFKA_TOPICS.ORDER_CREATED, groupId }, 'Registering dispatcher consumer');

  shutdownFn = await runConsumer(groupId, KAFKA_TOPICS.ORDER_CREATED, async (message) => {
    try {
      // Validate incoming message structure using OrderCreatedEventSchema
      const validatedEvent = OrderCreatedEventSchema.parse(message);

      logger.info(
        { orderId: validatedEvent.payload.orderId, correlationId: validatedEvent.metadata.correlationId },
        'Received order.created Kafka event in dispatcher consumer',
      );

      // Pass event to service to run candidate selection and assignment
      await dispatcherService.dispatchOrder(validatedEvent);
    } catch (err) {
      logger.error({ err, rawMessage: message }, 'Failed to process order.created event');
    }
  });
}

/**
 * Stop the dispatcher consumer gracefully on application shutdown.
 */
export async function stopDispatcherConsumer(): Promise<void> {
  if (shutdownFn) {
    logger.info('Stopping dispatcher consumer');
    await shutdownFn();
    shutdownFn = null;
  }
}

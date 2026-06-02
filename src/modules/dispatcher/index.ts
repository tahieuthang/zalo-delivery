import { Router } from 'express';
import { dispatcherRouter } from '@modules/dispatcher/dispatcher.controller';
import { startDispatcherConsumer } from '@modules/dispatcher/dispatcher.consumer';

export const router = Router();
router.use('/dispatcher', dispatcherRouter);

/**
 * Initialize dispatcher module by starting the Kafka consumer.
 */
export async function initModule(): Promise<void> {
  await startDispatcherConsumer();
}

export * from '@modules/dispatcher/dispatcher.types';
export * from '@modules/dispatcher/dispatcher.dto';
export { stopDispatcherConsumer } from '@modules/dispatcher/dispatcher.consumer';

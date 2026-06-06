import { Router } from 'express';
import { revenueRouter } from '@modules/revenue/revenue.controller';
import { startRevenueConsumer } from '@modules/revenue/revenue.consumer';

export const router = Router();
router.use('/revenue', revenueRouter);

export async function initModule(): Promise<void> {
  await startRevenueConsumer();
}

export * from '@modules/revenue/revenue.types';
export * from '@modules/revenue/revenue.dto';
export { stopRevenueConsumer } from '@modules/revenue/revenue.consumer';



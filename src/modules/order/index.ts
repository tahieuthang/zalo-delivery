import { Router } from 'express';
import { orderRouter } from '@modules/order/order.controller';

export const router = Router();
router.use('/orders', orderRouter);

export async function initModule(): Promise<void> {
  // Order module initialization logic (e.g. starting consumers if any in the future)
}

export * from '@modules/order/order.types';
export * from '@modules/order/order.dto';

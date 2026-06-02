import { Router } from 'express';
import { shipperRouter } from '@modules/shipper/shipper.controller';

export const router = Router();
router.use('/shippers', shipperRouter);

export async function initModule(): Promise<void> {
  // Shipper module initialization logic (if any in the future)
}

export * from '@modules/shipper/shipper.types';
export * from '@modules/shipper/shipper.dto';

import { Router } from 'express';
import { dashboardRouter } from './dashboard.controller';

export const router = Router();

export async function initModule(): Promise<void> {
  // Dashboard module initialized
}

export * from './dashboard.service';
export { dashboardRouter };

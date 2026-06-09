import { Router, Request, Response, NextFunction } from 'express';
import * as dashboardService from './dashboard.service';

export const dashboardRouter = Router();

/**
 * Get dashboard summary metrics (order counts, shipper counts, total revenue).
 * GET /api/dashboard/summary
 */
dashboardRouter.get(
  '/summary',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await dashboardService.getDashboardSummary();
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  },
);

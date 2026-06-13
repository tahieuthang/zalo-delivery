import { Router, Request, Response, NextFunction } from 'express';
import * as dashboardService from './dashboard.service';

export const dashboardRouter = Router();

/**
 * @openapi
 * /api/dashboard/summary:
 *   get:
 *     summary: Get dashboard summary metrics
 *     description: Retrieve total order counts by status, online/offline/busy shipper counts, and total system revenue (cached for 30 seconds).
 *     tags:
 *       - Dashboard
 *     responses:
 *       200:
 *         description: Success
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

import { Router, Request, Response, NextFunction } from 'express';
import * as trackingService from '@modules/tracking/tracking.service';

export const trackingRouter = Router();

/**
 * Get trajectory points of a specific order.
 * GET /api/orders/:id/trajectory
 */
trackingRouter.get(
  '/orders/:id/trajectory',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await trackingService.getTrajectoryByOrderId(req.params.id);
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  },
);

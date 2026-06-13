import { Router, Request, Response, NextFunction } from 'express';
import * as trackingService from '@modules/tracking/tracking.service';

export const trackingRouter = Router();

/**
 * @openapi
 * /api/orders/{id}/trajectory:
 *   get:
 *     summary: Get trajectory points of a specific order
 *     description: Retrieve historical GPS coordinates recorded for an order, ordered chronologically. Used for map replay.
 *     tags:
 *       - Tracking
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The Order ID
 *     responses:
 *       200:
 *         description: Success
 *       404:
 *         description: Order not found
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

/**
 * @openapi
 * /api/orders/{id}/tracking:
 *   get:
 *     summary: Get live tracking snapshot of a specific order
 *     description: Get current position of the shipper delivering this order, along with delivery coordinate, shipper name, and order status. Allowed only for ASSIGNED or DELIVERING orders.
 *     tags:
 *       - Tracking
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The Order ID
 *     responses:
 *       200:
 *         description: Success
 *       400:
 *         description: Invalid order state
 *       404:
 *         description: Order not found
 */
trackingRouter.get(
  '/orders/:id/tracking',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await trackingService.getLiveTracking(req.params.id);
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  },
);

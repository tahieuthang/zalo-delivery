import { Router, Request, Response, NextFunction } from 'express';
import * as revenueService from '@modules/revenue/revenue.service';
import { DailyRevenueQuerySchema } from '@modules/revenue/revenue.dto';
import { getConsumerLag } from '@infra/kafka/monitoring';
import { KAFKA_TOPICS } from '@infra/kafka/topics';

export const revenueRouter = Router();

/**
 * @openapi
 * /api/revenue/lag:
 *   get:
 *     summary: Get consumer lag report
 *     description: Fetch the current lag for the revenue service consumer group on the order.completed topic.
 *     tags:
 *       - Revenue
 *     responses:
 *       200:
 *         description: Success
 */
revenueRouter.get(
  '/lag',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const report = await getConsumerLag('revenue-service', KAFKA_TOPICS.ORDER_COMPLETED);
      res.status(200).json({ data: report });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * @openapi
 * /api/revenue/summary:
 *   get:
 *     summary: Get overall revenue summary
 *     description: Retrieve total system revenue and number of successful orders (cached for 5 minutes).
 *     tags:
 *       - Revenue
 *     responses:
 *       200:
 *         description: Success
 */
revenueRouter.get(
  '/summary',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await revenueService.getRevenueSummary();
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * @openapi
 * /api/revenue/shipper/{id}:
 *   get:
 *     summary: Get shipper earnings
 *     description: Retrieve the total earnings and historical revenue records for a specific shipper.
 *     tags:
 *       - Revenue
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The Shipper ID
 *     responses:
 *       200:
 *         description: Success
 */
revenueRouter.get(
  '/shipper/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await revenueService.getRevenueByShipper(req.params.id);
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * @openapi
 * /api/revenue/daily:
 *   get:
 *     summary: Get daily revenue aggregation
 *     description: Retrieve daily aggregated revenue and order count statistics, optionally filtered by date range.
 *     tags:
 *       - Revenue
 *     parameters:
 *       - in: query
 *         name: from
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter start date (YYYY-MM-DD)
 *       - in: query
 *         name: to
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter end date (YYYY-MM-DD)
 *     responses:
 *       200:
 *         description: Success
 */
revenueRouter.get(
  '/daily',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = DailyRevenueQuerySchema.parse(req.query);
      const result = await revenueService.getDailyRevenue(query.from, query.to);
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  },
);

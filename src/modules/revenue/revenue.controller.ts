import { Router, Request, Response, NextFunction } from 'express';
import * as revenueService from './revenue.service';
import { DailyRevenueQuerySchema } from './revenue.dto';
import { getConsumerLag } from '@infra/kafka/monitoring';
import { KAFKA_TOPICS } from '@infra/kafka/topics';

export const revenueRouter = Router();

/**
 * GET /api/revenue/lag
 * Get consumer lag report for revenue service.
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
 * GET /api/revenue/summary
 * Get total revenue and successful order count.
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
 * GET /api/revenue/shipper/:id
 * Get total earnings and records of a specific shipper.
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
 * GET /api/revenue/daily
 * Get daily revenue aggregated statistics.
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

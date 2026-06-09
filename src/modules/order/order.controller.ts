import { Router, Request, Response, NextFunction } from 'express';
import { validate } from '@shared/middleware/validate';
import { CreateOrderDto } from '@modules/order/order.dto';
import * as orderService from '@modules/order/order.service';

export const orderRouter = Router();

/**
 * Endpoint to create a new order manually.
 * POST /api/orders
 */
orderRouter.post(
  '/',
  validate(CreateOrderDto),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await orderService.createOrder(req.body);
      res.status(201).json({ data: result });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * Endpoint to get all orders.
 * GET /api/orders
 */
orderRouter.get(
  '/',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await orderService.getOrders(req.query);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * Endpoint to get order details by ID.
 * GET /api/orders/:id
 */
orderRouter.get(
  '/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await orderService.getOrderById(req.params.id);
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  },
);


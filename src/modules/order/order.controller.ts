import { Router, Request, Response, NextFunction } from 'express';
import { validate } from '@shared/middleware/validate';
import { CreateOrderDto } from '@modules/order/order.dto';
import * as orderService from '@modules/order/order.service';

export const orderRouter = Router();

/**
 * @openapi
 * /api/orders:
 *   post:
 *     summary: Create a new order manually
 *     description: Geocode addresses to coordinates, save the order with PENDING status, and publish order.created event to Kafka.
 *     tags:
 *       - Order
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - customerId
 *               - pickupAddress
 *               - deliveryAddress
 *             properties:
 *               customerId:
 *                 type: string
 *               pickupAddress:
 *                 type: string
 *               deliveryAddress:
 *                 type: string
 *               note:
 *                 type: string
 *     responses:
 *       201:
 *         description: Created
 *       400:
 *         description: Geocoding failed or validation error
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
 * @openapi
 * /api/orders:
 *   get:
 *     summary: Get all orders with filtering and pagination
 *     description: Retrieve all orders, optionally filtered by status, shipperId, and creation date range, with offset-based pagination.
 *     tags:
 *       - Order
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: Comma-separated list of statuses (e.g. PENDING,DELIVERING)
 *       - in: query
 *         name: shipperId
 *         schema:
 *           type: string
 *         description: Filter by Shipper ID
 *       - in: query
 *         name: from
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter from creation timestamp
 *       - in: query
 *         name: to
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter to creation timestamp
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Items per page
 *     responses:
 *       200:
 *         description: Success
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
 * @openapi
 * /api/orders/{id}:
 *   get:
 *     summary: Get order details by ID
 *     description: Retrieve detailed information of an order including assigned shipper, trajectory count, revenue data, and shipper dispatch offer history (offerLogs).
 *     tags:
 *       - Order
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

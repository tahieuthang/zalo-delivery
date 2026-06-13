import { Router, Request, Response, NextFunction } from 'express';
import * as dispatcherService from '@modules/dispatcher/dispatcher.service';
import { ulid } from '@shared/utils/id-generator';
import { validate } from '@shared/middleware/validate';
import { ShipperResponseRequestDto } from '@modules/dispatcher/dispatcher.dto';
import { getConsumerLag } from '@infra/kafka/monitoring';
import { KAFKA_TOPICS } from '@infra/kafka/topics';

export const dispatcherRouter = Router();

/**
 * @openapi
 * /api/dispatcher/status:
 *   get:
 *     summary: Get dispatcher status
 *     description: Check if the dispatcher Kafka consumer is active.
 *     tags:
 *       - Dispatcher
 *     responses:
 *       200:
 *         description: Success
 */
dispatcherRouter.get(
  '/status',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.status(200).json({
        data: {
          status: 'ACTIVE',
          info: 'Dispatcher Kafka consumer is active and processing events',
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * @openapi
 * /api/dispatcher/lag:
 *   get:
 *     summary: Get dispatcher consumer lag
 *     description: Check partition offsets and lag for the dispatcher-service consumer group.
 *     tags:
 *       - Dispatcher
 *     responses:
 *       200:
 *         description: Success
 */
dispatcherRouter.get(
  '/lag',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const report = await getConsumerLag('dispatcher-service', KAFKA_TOPICS.ORDER_CREATED);
      res.status(200).json({ data: report });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * @openapi
 * /api/dispatcher/trigger:
 *   post:
 *     summary: Manually trigger order dispatch (Dev Helper)
 *     description: Construct a mock order.created event and execute dispatch logic directly.
 *     tags:
 *       - Dispatcher
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - orderId
 *               - pickupLat
 *               - pickupLng
 *             properties:
 *               orderId:
 *                 type: string
 *               pickupLat:
 *                 type: number
 *               pickupLng:
 *                 type: number
 *     responses:
 *       200:
 *         description: Success
 */
dispatcherRouter.post(
  '/trigger',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { orderId, pickupLat, pickupLng } = req.body;

      if (!orderId || pickupLat === undefined || pickupLng === undefined) {
        res.status(400).json({
          error: 'Missing orderId, pickupLat, or pickupLng in request body',
        });
        return;
      }

      // Construct a mock Kafka event payload
      const mockEvent = {
        version: 1,
        eventType: 'order.created',
        payload: {
          orderId,
          pickupLat: Number(pickupLat),
          pickupLng: Number(pickupLng),
          customerId: 'mock-customer-id',
          pickupAddress: 'Mock Pickup Address',
          deliveryAddress: 'Mock Delivery Address',
          deliveryLat: Number(pickupLat) + 0.01,
          deliveryLng: Number(pickupLng) + 0.01,
          createdAt: new Date().toISOString(),
        },
        metadata: {
          correlationId: ulid(),
          timestamp: new Date().toISOString(),
        },
      };

      // Execute dispatch logic directly
      await dispatcherService.dispatchOrder(mockEvent);

      res.status(200).json({
        data: {
          message: 'Dispatcher triggered successfully',
          event: mockEvent,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * @openapi
 * /api/dispatcher/respond:
 *   post:
 *     summary: Handle shipper accept/reject response
 *     description: Process shipper's response to an order offer. Updates order to ASSIGNED on accept, or triggers routing to next candidate on reject.
 *     tags:
 *       - Dispatcher
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - orderId
 *               - shipperId
 *               - action
 *             properties:
 *               orderId:
 *                 type: string
 *               shipperId:
 *                 type: string
 *               action:
 *                 type: string
 *                 enum: [accept, reject]
 *     responses:
 *       200:
 *         description: Success
 *       400:
 *         description: Invalid action or order expired
 */
dispatcherRouter.post(
  '/respond',
  validate(ShipperResponseRequestDto),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { orderId, shipperId, action } = req.body;
      const result = await dispatcherService.handleShipperResponse(orderId, shipperId, action);
      if (result.success) {
        res.status(200).json({
          data: {
            message: `Shipper successfully responded with: ${action}`,
          },
        });
      } else {
        res.status(400).json({ error: result.error });
      }
    } catch (err) {
      next(err);
    }
  },
);

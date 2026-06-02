import { Router, Request, Response, NextFunction } from 'express';
import * as dispatcherService from '@modules/dispatcher/dispatcher.service';
import { ulid } from '@shared/utils/id-generator';

export const dispatcherRouter = Router();

/**
 * Health status check.
 * GET /api/dispatcher/status
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
 * Developer helper route to manually trigger order dispatch logic.
 * POST /api/dispatcher/trigger
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

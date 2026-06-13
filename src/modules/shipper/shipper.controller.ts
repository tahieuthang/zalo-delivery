import { Router, Request, Response, NextFunction } from 'express';
import { validate } from '@shared/middleware/validate';
import {
  CreateShipperDto,
  UpdateShipperDto,
  ToggleShipperStatusDto,
} from '@modules/shipper/shipper.dto';
import * as shipperService from '@modules/shipper/shipper.service';

export const shipperRouter = Router();

/**
 * @openapi
 * /api/shippers:
 *   post:
 *     summary: Create a new shipper
 *     description: Register a new shipper with vehicle details.
 *     tags:
 *       - Shipper
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - phone
 *               - vehicleType
 *             properties:
 *               name:
 *                 type: string
 *               phone:
 *                 type: string
 *               vehicleType:
 *                 type: string
 *                 enum: [BIKE, MOTORCYCLE, TRUCK]
 *     responses:
 *       201:
 *         description: Created
 */
shipperRouter.post(
  '/',
  validate(CreateShipperDto),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await shipperService.createShipper(req.body);
      res.status(201).json({ data: result });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * @openapi
 * /api/shippers:
 *   get:
 *     summary: Get all shippers
 *     description: Retrieve list of all shippers in the system.
 *     tags:
 *       - Shipper
 *     responses:
 *       200:
 *         description: Success
 */
shipperRouter.get(
  '/',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await shipperService.getAllShippers();
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * @openapi
 * /api/shippers/{id}:
 *   get:
 *     summary: Get shipper details by ID
 *     description: Retrieve profile information of a specific shipper.
 *     tags:
 *       - Shipper
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
 *       404:
 *         description: Shipper not found
 */
shipperRouter.get(
  '/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await shipperService.getShipperById(req.params.id);
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * @openapi
 * /api/shippers/{id}:
 *   put:
 *     summary: Update shipper details
 *     description: Update profile information of an existing shipper.
 *     tags:
 *       - Shipper
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The Shipper ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               phone:
 *                 type: string
 *               vehicleType:
 *                 type: string
 *               zaloUserId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Success
 *       404:
 *         description: Shipper not found
 */
shipperRouter.put(
  '/:id',
  validate(UpdateShipperDto),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await shipperService.updateShipper(req.params.id, req.body);
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * @openapi
 * /api/shippers/{id}:
 *   delete:
 *     summary: Delete a shipper
 *     description: Soft-delete a shipper profile.
 *     tags:
 *       - Shipper
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The Shipper ID
 *     responses:
 *       204:
 *         description: No Content
 *       404:
 *         description: Shipper not found
 */
shipperRouter.delete(
  '/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await shipperService.deleteShipper(req.params.id);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  },
);

/**
 * @openapi
 * /api/shippers/{id}/status:
 *   patch:
 *     summary: Toggle shipper status online/offline
 *     description: Set shipper status to ONLINE or OFFLINE. When ONLINE, adds to Redis Geo for location-based search.
 *     tags:
 *       - Shipper
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The Shipper ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [ONLINE, OFFLINE]
 *               lat:
 *                 type: number
 *                 description: Required if status is ONLINE
 *               lng:
 *                 type: number
 *                 description: Required if status is ONLINE
 *     responses:
 *       200:
 *         description: Success
 *       404:
 *         description: Shipper not found
 */
shipperRouter.patch(
  '/:id/status',
  validate(ToggleShipperStatusDto),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await shipperService.toggleStatus(req.params.id, req.body);
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * @openapi
 * /api/shippers/{id}/location:
 *   get:
 *     summary: Get shipper live location
 *     description: Fetch the current latitude/longitude coordinate of an active shipper from Redis Geo.
 *     tags:
 *       - Shipper
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
 *       404:
 *         description: Shipper location not found in Redis
 */
shipperRouter.get(
  '/:id/location',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await shipperService.getShipperLiveLocation(req.params.id);
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  },
);

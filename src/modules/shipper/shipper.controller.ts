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
 * Create a new shipper.
 * POST /api/shippers
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
 * Get all shippers.
 * GET /api/shippers
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
 * Get shipper details by ID.
 * GET /api/shippers/:id
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
 * Update shipper details.
 * PUT /api/shippers/:id
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
 * Delete a shipper.
 * DELETE /api/shippers/:id
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
 * Toggle shipper status online/offline and update location in Redis.
 * PATCH /api/shippers/:id/status
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

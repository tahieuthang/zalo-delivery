import { z } from 'zod';
import {
  CreateShipperDto,
  UpdateShipperDto,
  ToggleShipperStatusDto,
  ShipperResponseDto,
} from '@modules/shipper/shipper.dto';

export type CreateShipperInput = z.infer<typeof CreateShipperDto>;
export type UpdateShipperInput = z.infer<typeof UpdateShipperDto>;
export type ToggleShipperStatusInput = z.infer<typeof ToggleShipperStatusDto>;
export type ShipperResponse = z.infer<typeof ShipperResponseDto>;

export type ShipperStatus = 'ONLINE' | 'OFFLINE';

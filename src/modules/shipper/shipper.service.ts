import { ulid } from '@shared/utils/id-generator';
import { AppError } from '@shared/errors/app-error';
import { ErrorCode } from '@shared/errors/error-codes';
import * as shipperRepo from '@modules/shipper/shipper.repository';
import type {
  CreateShipperInput,
  UpdateShipperInput,
  ToggleShipperStatusInput,
  ShipperResponse,
  ShipperStatus,
} from '@modules/shipper/shipper.types';
import {
  addShipperLocation,
  removeShipperLocation,
  markShipperFree,
} from '@infra/redis/geo.service';
import logger from '@shared/logger/logger';

/**
 * Helper to map DB Shipper to ShipperResponse shape.
 */
function mapToResponse(shipper: any): ShipperResponse {
  return {
    id: shipper.id,
    name: shipper.name,
    phone: shipper.phone,
    vehicleType: shipper.vehicleType,
    status: shipper.status as ShipperStatus,
    totalEarnings: shipper.totalEarnings,
    createdAt: shipper.createdAt.toISOString(),
    updatedAt: shipper.updatedAt.toISOString(),
  };
}

/**
 * Create a new shipper.
 */
export async function createShipper(input: CreateShipperInput): Promise<ShipperResponse> {
  logger.info({ name: input.name }, 'Creating new shipper');
  
  const id = ulid();
  const shipper = await shipperRepo.create({
    id,
    name: input.name,
    phone: input.phone,
    vehicleType: input.vehicleType,
    status: 'OFFLINE',
    totalEarnings: 0,
  });

  return mapToResponse(shipper);
}

/**
 * Retrieve shipper details by ID.
 */
export async function getShipperById(id: string): Promise<ShipperResponse> {
  const shipper = await shipperRepo.findById(id);
  if (!shipper) {
    throw new AppError(404, ErrorCode.SHIPPER_NOT_FOUND, `Không tìm thấy tài xế với ID: ${id}`);
  }
  return mapToResponse(shipper);
}

/**
 * Get all active shippers.
 */
export async function getAllShippers(): Promise<ShipperResponse[]> {
  const shippers = await shipperRepo.findAll();
  return shippers.map(mapToResponse);
}

/**
 * Update shipper details.
 */
export async function updateShipper(id: string, input: UpdateShipperInput): Promise<ShipperResponse> {
  // Ensure shipper exists
  await getShipperById(id);

  const updated = await shipperRepo.update(id, input);
  logger.info({ id }, 'Shipper updated successfully');
  return mapToResponse(updated);
}

/**
 * Soft delete a shipper and clean up active Redis state.
 */
export async function deleteShipper(id: string): Promise<void> {
  // Ensure shipper exists
  await getShipperById(id);

  await shipperRepo.softDelete(id);
  
  // Clean up Redis locations and status
  await removeShipperLocation(id);
  await markShipperFree(id);
  
  logger.info({ id }, 'Shipper soft deleted and removed from Redis');
}

/**
 * Toggle shipper status online/offline and sync with Redis.
 */
export async function toggleStatus(
  id: string,
  input: ToggleShipperStatusInput,
): Promise<ShipperResponse> {
  // Ensure shipper exists
  await getShipperById(id);

  const updated = await shipperRepo.update(id, {
    status: input.status,
  });

  if (input.status === 'ONLINE') {
    // Add location to Redis Geospatial set
    await addShipperLocation(id, input.lng!, input.lat!);
    logger.info({ id, lat: input.lat, lng: input.lng }, 'Shipper is now ONLINE and location added to Redis');
  } else {
    // Remove location from Redis and free up busy status
    await removeShipperLocation(id);
    await markShipperFree(id);
    logger.info({ id }, 'Shipper is now OFFLINE and removed from Redis');
  }

  return mapToResponse(updated);
}

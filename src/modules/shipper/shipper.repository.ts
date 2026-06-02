import { prisma } from '@infra/database/prisma-client';
import { Prisma } from '@prisma/client';

/**
 * Create a new shipper in PostgreSQL.
 */
export async function create(data: Prisma.ShipperCreateInput) {
  return prisma.shipper.create({ data });
}

/**
 * Find a shipper by ID, checking soft-deleted state.
 */
export async function findById(id: string) {
  return prisma.shipper.findUnique({
    where: {
      id,
      deletedAt: null,
    },
  });
}

/**
 * Update an existing shipper.
 */
export async function update(id: string, data: Prisma.ShipperUpdateInput) {
  return prisma.shipper.update({
    where: { id },
    data,
  });
}

/**
 * Get all active shippers.
 */
export async function findAll() {
  return prisma.shipper.findMany({
    where: {
      deletedAt: null,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });
}

/**
 * Soft delete a shipper by setting deletedAt timestamp.
 */
export async function softDelete(id: string) {
  return prisma.shipper.update({
    where: { id },
    data: {
      deletedAt: new Date(),
    },
  });
}

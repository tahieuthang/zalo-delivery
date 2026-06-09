import { prisma } from '@infra/database/prisma-client';
import { Prisma } from '@prisma/client';

/**
 * Create a new order in PostgreSQL database.
 */
export async function create(data: Prisma.OrderCreateInput) {
  return prisma.order.create({ data });
}

/**
 * Find an order by its ID, ensuring it has not been soft-deleted.
 */
export async function findById(id: string) {
  return prisma.order.findUnique({
    where: {
      id,
      deletedAt: null,
    },
  });
}

/**
 * Find an order by ID with enriched details (shipper, revenue, trajectory count).
 */
export async function findDetailedById(id: string) {
  return prisma.order.findUnique({
    where: {
      id,
      deletedAt: null,
    },
    include: {
      shipper: true,
      revenues: true,
      _count: {
        select: { trajectory: true },
      },
    },
  });
}

/**
 * Update an existing order.
 */
export async function update(id: string, data: Prisma.OrderUpdateInput) {
  return prisma.order.update({
    where: { id },
    data,
  });
}

/**
 * Find all non-deleted orders, sorted by creation date.
 */
export async function findAll() {
  return prisma.order.findMany({
    where: {
      deletedAt: null,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });
}


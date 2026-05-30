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
 * Update an existing order.
 */
export async function update(id: string, data: Prisma.OrderUpdateInput) {
  return prisma.order.update({
    where: { id },
    data,
  });
}

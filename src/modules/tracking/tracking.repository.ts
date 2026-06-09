import { prisma } from '@infra/database/prisma-client';

/**
 * Fetch all trajectory points for an order ordered by creation time ascending.
 */
export async function findByOrderId(orderId: string) {
  return prisma.trajectoryPoint.findMany({
    where: {
      orderId,
    },
    orderBy: {
      createdAt: 'asc',
    },
  });
}

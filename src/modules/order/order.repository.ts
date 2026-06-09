import { prisma } from '@infra/database/prisma-client';
import { Prisma, OrderStatus } from '@prisma/client';

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

/**
 * Find and count orders matching filters with offset-based pagination.
 */
export async function findAndCount(params: {
  statuses?: OrderStatus[];
  shipperId?: string;
  from?: Date;
  to?: Date;
  skip?: number;
  take?: number;
}) {
  const where: Prisma.OrderWhereInput = {
    deletedAt: null,
  };

  if (params.statuses) {
    where.status = { in: params.statuses };
  }

  if (params.shipperId) {
    where.shipperId = params.shipperId;
  }

  if (params.from || params.to) {
    where.createdAt = {};
    if (params.from) {
      where.createdAt.gte = params.from;
    }
    if (params.to) {
      where.createdAt.lte = params.to;
    }
  }

  const [total, data] = await prisma.$transaction([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: params.skip,
      take: params.take,
    }),
  ]);

  return { total, data };
}


import { prisma } from '@infra/database/prisma-client';
import { ulid } from '@shared/utils/id-generator';

export async function createRevenueAndIncrementEarnings(data: {
  orderId: string;
  shipperId: string;
  amount: number;
  completedAt: Date;
}) {
  return prisma.$transaction(async (tx) => {
    // 1. Create the revenue record
    const revenue = await tx.revenueRecord.create({
      data: {
        id: ulid(),
        orderId: data.orderId,
        shipperId: data.shipperId,
        amount: data.amount,
        type: 'delivery',
        completedAt: data.completedAt,
      },
    });

    // 2. Increment the shipper's total earnings atomically
    await tx.shipper.update({
      where: { id: data.shipperId },
      data: {
        totalEarnings: {
          increment: data.amount,
        },
      },
    });

    return revenue;
  });
}

export async function getRevenueSummary() {
  const aggregate = await prisma.revenueRecord.aggregate({
    _sum: { amount: true },
    _count: { id: true },
  });
  return {
    totalRevenue: aggregate._sum.amount || 0,
    totalOrders: aggregate._count.id || 0,
  };
}

export async function getRevenueByShipper(shipperId: string) {
  const records = await prisma.revenueRecord.findMany({
    where: { shipperId },
    orderBy: { completedAt: 'desc' },
  });
  const sum = records.reduce((acc, curr) => acc + curr.amount, 0);
  return {
    shipperId,
    totalEarnings: sum,
    records: records.map(r => ({
      id: r.id,
      orderId: r.orderId,
      amount: r.amount,
      type: r.type,
      completedAt: r.completedAt.toISOString(),
      createdAt: r.createdAt.toISOString(),
    })),
  };
}

export async function getDailyRevenue(from?: Date, to?: Date) {
  const results = await prisma.$queryRaw<Array<{ date: Date; amount: number; count: number }>>`
    SELECT 
      DATE_TRUNC('day', "completed_at") AS "date",
      SUM("amount")::float AS "amount",
      COUNT("id")::int AS "count"
    FROM "revenue"
    WHERE ("completed_at" >= COALESCE(${from}, '1970-01-01'::timestamp))
      AND ("completed_at" <= COALESCE(${to}, '2100-01-01'::timestamp))
    GROUP BY DATE_TRUNC('day', "completed_at")
    ORDER BY "date" ASC;
  `;
  return results.map(r => ({
    date: r.date.toISOString().slice(0, 10),
    amount: r.amount || 0,
    count: Number(r.count || 0),
  }));
}

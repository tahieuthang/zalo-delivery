import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getDashboardSummary } from '@modules/dashboard/dashboard.service';
import { prisma } from '@infra/database/prisma-client';
import { redis } from '@infra/redis/redis-client';

vi.mock('@infra/database/prisma-client', () => ({
  prisma: {
    $transaction: vi.fn(),
    order: {
      count: vi.fn(),
    },
    shipper: {
      count: vi.fn(),
    },
    revenueRecord: {
      aggregate: vi.fn(),
    },
  },
}));

vi.mock('@infra/redis/redis-client', () => ({
  redis: {
    get: vi.fn(),
    set: vi.fn(),
  },
}));

describe('Dashboard Service Layer (Task 7.4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return cached summary if available in Redis', async () => {
    const cachedSummary = {
      orders: { PENDING: 5 },
      shippers: { ONLINE: 2 },
      totalRevenue: 150000,
      computedAt: '2026-06-09T00:00:00.000Z',
    };

    vi.mocked(redis.get).mockResolvedValue(JSON.stringify(cachedSummary));

    const result = await getDashboardSummary();

    expect(redis.get).toHaveBeenCalledWith('dashboard:summary');
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(result).toEqual(cachedSummary);
  });

  it('should compute summary from DB and cache it if not in Redis', async () => {
    vi.mocked(redis.get).mockResolvedValue(null);

    const mockTxResult = [
      10, // pendingCount
      0,  // waitingAcceptanceCount
      0,  // assignedCount
      3,  // deliveringCount
      0,  // successCount
      0,  // failedCount
      0,  // noShipperCount
      4,  // onlineCount
      0,  // offlineCount
      2,  // busyCount
      { _sum: { amount: 90000 } }, // revenueSum
    ];

    vi.mocked(prisma.$transaction).mockResolvedValue(mockTxResult);

    const result = await getDashboardSummary();

    expect(prisma.$transaction).toHaveBeenCalled();
    expect(redis.set).toHaveBeenCalledWith(
      'dashboard:summary',
      expect.any(String),
      'EX',
      30
    );

    expect(result.orders.PENDING).toBe(10);
    expect(result.orders.DELIVERING).toBe(3);
    expect(result.orders.SUCCESS).toBe(0);
    expect(result.shippers.ONLINE).toBe(4);
    expect(result.shippers.BUSY).toBe(2);
    expect(result.totalRevenue).toBe(90000);
  });
});

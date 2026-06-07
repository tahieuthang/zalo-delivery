import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processOrderCompleted, getRevenueSummary } from '@modules/revenue/revenue.service';
import * as revenueRepo from '@modules/revenue/revenue.repository';
import { redis } from '@infra/redis/redis-client';

vi.mock('@modules/revenue/revenue.repository');
vi.mock('@infra/redis/redis-client', () => ({
  redis: {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    keys: vi.fn().mockResolvedValue([]),
  },
}));

describe('Revenue Service (Task 6.2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should process order completed event, call repo and invalidate cache', async () => {
    const mockRepoResult = {
      revenueRecord: { id: 'rev-123', orderId: 'ord-123', amount: 30000 },
      updatedShipper: { id: 'ship-123', totalEarnings: 30000 },
    };

    vi.mocked(revenueRepo.createRevenueAndIncrementEarnings).mockResolvedValue(mockRepoResult as any);

    const payload = {
      orderId: 'ord-123',
      shipperId: 'ship-123',
      amount: 30000,
      completedAt: '2026-06-07T10:00:00.000Z',
    };

    const result = await processOrderCompleted(payload);

    expect(revenueRepo.createRevenueAndIncrementEarnings).toHaveBeenCalledWith({
      orderId: payload.orderId,
      shipperId: payload.shipperId,
      amount: payload.amount,
      completedAt: new Date(payload.completedAt),
    });

    expect(redis.del).toHaveBeenCalledWith('revenue:summary');
    expect(result).toEqual(mockRepoResult);
  });

  it('should return cached revenue summary if present', async () => {
    const cachedSummary = { totalRevenue: 100000, totalOrders: 5 };
    vi.mocked(redis.get).mockResolvedValue(JSON.stringify(cachedSummary));

    const result = await getRevenueSummary();

    expect(redis.get).toHaveBeenCalledWith('revenue:summary');
    expect(revenueRepo.getRevenueSummary).not.toHaveBeenCalled();
    expect(result).toEqual(cachedSummary);
  });
});

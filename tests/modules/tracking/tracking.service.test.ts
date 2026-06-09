import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getHaversineDistance,
  getTrajectoryByOrderId,
} from '@modules/tracking/tracking.service';
import * as trackingRepo from '@modules/tracking/tracking.repository';
import { prisma } from '@infra/database/prisma-client';

vi.mock('@modules/tracking/tracking.repository');
vi.mock('@infra/database/prisma-client', () => ({
  prisma: {
    order: {
      findUnique: vi.fn(),
    },
  },
}));

describe('Tracking Haversine Distance (Task 6.2)', () => {
  it('should calculate the correct distance between two points in District 1', () => {
    const lat1 = 10.775;
    const lon1 = 106.695;
    
    // A point nearby (approx 15.6 meters away)
    const lat2 = 10.7751;
    const lon2 = 106.6951;

    const distance = getHaversineDistance(lat1, lon1, lat2, lon2);
    expect(distance).toBeGreaterThan(14);
    expect(distance).toBeLessThan(17);
  });

  it('should return 0 for the exact same point', () => {
    const lat = 10.775;
    const lon = 106.695;
    const distance = getHaversineDistance(lat, lon, lat, lon);
    expect(distance).toBe(0);
  });
});

describe('Trajectory Service (Phase 7)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch trajectory history successfully', async () => {
    const mockOrder = { id: 'order-1' };
    vi.mocked(prisma.order.findUnique).mockResolvedValue(mockOrder as any);

    const mockPoints = [
      { lat: 10.7, lng: 106.7, createdAt: new Date('2026-06-01T00:00:00.000Z') },
    ];
    vi.mocked(trackingRepo.findByOrderId).mockResolvedValue(mockPoints as any);

    const result = await getTrajectoryByOrderId('order-1');
    expect(result).toEqual([{ lat: 10.7, lng: 106.7, createdAt: '2026-06-01T00:00:00.000Z' }]);
  });
});

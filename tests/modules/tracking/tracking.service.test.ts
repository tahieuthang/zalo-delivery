import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getHaversineDistance,
  getTrajectoryByOrderId,
  getLiveTracking,
} from '@modules/tracking/tracking.service';
import * as trackingRepo from '@modules/tracking/tracking.repository';
import * as geoService from '@infra/redis/geo.service';
import { prisma } from '@infra/database/prisma-client';

vi.mock('@modules/tracking/tracking.repository');
vi.mock('@infra/database/prisma-client', () => ({
  prisma: {
    order: {
      findUnique: vi.fn(),
    },
  },
}));
vi.mock('@infra/redis/geo.service');

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

describe('Trajectory and Live Tracking Services (Phase 7)', () => {
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

  it('should get live tracking for assigned/delivering orders', async () => {
    const mockOrder = {
      id: 'order-1',
      status: 'DELIVERING',
      shipperId: 'shipper-1',
      deliveryLat: 10.8,
      deliveryLng: 106.8,
      shipper: { name: 'Shipper A' },
    };
    vi.mocked(prisma.order.findUnique).mockResolvedValue(mockOrder as any);
    vi.mocked(geoService.getShipperLocation).mockResolvedValue({ lat: 10.75, lng: 106.75 });

    const result = await getLiveTracking('order-1');
    expect(result).toEqual({
      orderId: 'order-1',
      status: 'DELIVERING',
      deliveryLat: 10.8,
      deliveryLng: 106.8,
      shipperName: 'Shipper A',
      shipperLocation: { lat: 10.75, lng: 106.75 },
    });
  });

  it('should throw error for live tracking if order not assigned/delivering', async () => {
    const mockOrder = {
      id: 'order-1',
      status: 'PENDING',
      shipperId: null,
    };
    vi.mocked(prisma.order.findUnique).mockResolvedValue(mockOrder as any);

    await expect(getLiveTracking('order-1')).rejects.toThrow(
      'Theo dõi trực tuyến chỉ khả dụng cho đơn hàng ở trạng thái ASSIGNED hoặc DELIVERING'
    );
  });
});

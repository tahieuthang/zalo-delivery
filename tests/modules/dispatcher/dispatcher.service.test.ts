import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as dispatcherService from '@modules/dispatcher/dispatcher.service';
import * as geoService from '@infra/redis/geo.service';
import { getRoute } from '@infra/osrm/osrm-client';
import * as orderService from '@modules/order/order.service';
import { producer } from '@infra/kafka/producer';
import { redis } from '@infra/redis/redis-client';
import { prisma } from '@infra/database/prisma-client';
import { notificationService } from '@infra/notification';

vi.mock('@infra/redis/geo.service');
vi.mock('@infra/osrm/osrm-client');
vi.mock('@modules/order/order.service');
vi.mock('@infra/kafka/producer');
vi.mock('@infra/redis/redis-client', () => ({
  redis: {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    geopos: vi.fn(),
  },
}));
vi.mock('@infra/database/prisma-client', () => ({
  prisma: {
    order: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    shipper: {
      findUnique: vi.fn(),
    },
    orderOfferLog: {
      create: vi.fn(),
      updateMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));
vi.mock('@infra/notification', () => ({
  notificationService: {
    sendOrderOffer: vi.fn(),
    sendAcceptConfirm: vi.fn(),
    sendRejectConfirm: vi.fn(),
    sendTimeoutNotice: vi.fn(),
    sendDeliveringStatus: vi.fn(),
    sendSuccessStatus: vi.fn(),
  },
}));

describe('Dispatcher Service Confirmation Flow (Phase 2.5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. should match candidates, cache them in Redis and offer to the closest shipper', async () => {
    const mockEvent = {
      version: 1,
      eventType: 'order.created',
      payload: {
        orderId: 'mock-order-id',
        pickupLat: 10.776,
        pickupLng: 106.701,
        customerId: 'mock-customer-id',
        pickupAddress: 'Pickup Address',
        deliveryAddress: 'Delivery Address',
        deliveryLat: 10.78,
        deliveryLng: 106.71,
        createdAt: new Date().toISOString(),
      },
      metadata: {
        correlationId: 'mock-correlation-id',
        timestamp: new Date().toISOString(),
      },
    };

    // 1 nearby shipper found
    vi.mocked(geoService.findNearby).mockResolvedValue([['shipper-1', '500']] as any);
    vi.mocked(geoService.isShipperBusy).mockResolvedValue(false);
    vi.mocked(redis.geopos).mockResolvedValue([['106.700', '10.775']] as any);
    vi.mocked(getRoute).mockResolvedValue({
      distanceMeters: 600,
      durationSeconds: 120,
      coordinates: [[106.700, 10.775], [106.701, 10.776]],
    });

    // Mock DB reads
    const mockOrder = { id: 'mock-order-id', status: 'PENDING', deliveryAddress: 'Delivery Address' };
    const mockShipper = { id: 'shipper-1', name: 'Shipper 1', phone: '0912345678' };
    vi.mocked(prisma.order.findUnique).mockResolvedValue(mockOrder as any);
    vi.mocked(prisma.shipper.findUnique).mockResolvedValue(mockShipper as any);

    // Mock candidates read for offer
    vi.mocked(redis.get).mockImplementation(async (key) => {
      if (key === 'order:candidates:mock-order-id') {
        return JSON.stringify([{
          shipperId: 'shipper-1',
          distanceMeters: 600,
          durationSeconds: 120,
          coordinates: [[106.700, 10.775], [106.701, 10.776]],
        }]);
      }
      return null;
    });

    await dispatcherService.dispatchOrder(mockEvent);

    // Verify candidates are cached in Redis
    expect(redis.set).toHaveBeenCalledWith(
      'order:candidates:mock-order-id',
      expect.stringContaining('shipper-1'),
      'EX',
      300
    );

    // Verify order status is updated to WAITING_ACCEPTANCE in DB
    expect(prisma.order.update).toHaveBeenCalledWith({
      where: { id: 'mock-order-id' },
      data: { status: 'WAITING_ACCEPTANCE' },
    });

    // Verify pending accept lock set in Redis for 35s (with buffer)
    expect(redis.set).toHaveBeenCalledWith(
      'order:pending_accept:mock-order-id',
      'shipper-1',
      'EX',
      35
    );

    // Verify Notification offer is sent
    expect(notificationService.sendOrderOffer).toHaveBeenCalledWith(
      mockShipper,
      expect.objectContaining({ id: 'mock-order-id', distance: 600 })
    );
  });

  it('2. should assign order, mark shipper busy and publish event on ACCEPT', async () => {
    // Mock DB queries
    const mockOrder = { id: 'mock-order-id', status: 'WAITING_ACCEPTANCE' };
    const mockShipper = { id: 'shipper-1', name: 'Shipper 1', phone: '0912345678' };
    vi.mocked(prisma.order.findUnique).mockResolvedValue(mockOrder as any);
    vi.mocked(prisma.shipper.findUnique).mockResolvedValue(mockShipper as any);

    // Mock Redis locks & metadata
    vi.mocked(redis.get).mockImplementation(async (key) => {
      if (key === 'order:pending_accept:mock-order-id') return 'shipper-1';
      if (key === 'order:offer_meta:mock-order-id') return JSON.stringify({ distanceMeters: 600, durationSeconds: 120 });
      return null;
    });

    const result = await dispatcherService.handleShipperResponse('mock-order-id', 'shipper-1', 'accept');

    expect(result.success).toBe(true);

    // Verify order status updated to ASSIGNED with shipperId
    expect(prisma.order.update).toHaveBeenCalledWith({
      where: { id: 'mock-order-id' },
      data: { status: 'ASSIGNED', shipperId: 'shipper-1' },
    });

    // Verify shipper marked busy
    expect(geoService.markShipperBusy).toHaveBeenCalledWith('shipper-1');

    // Verify Kafka event published
    expect(producer.send).toHaveBeenCalled();

    // Verify accept notification sent
    expect(notificationService.sendAcceptConfirm).toHaveBeenCalledWith(mockShipper, mockOrder);
  });

  it('3. should cooldown shipper, send reject notice and try next candidate on REJECT', async () => {
    const mockOrder = { id: 'mock-order-id', status: 'WAITING_ACCEPTANCE' };
    const mockShipper = { id: 'shipper-1', name: 'Shipper 1', phone: '0912345678' };
    vi.mocked(prisma.order.findUnique).mockResolvedValue(mockOrder as any);
    vi.mocked(prisma.shipper.findUnique).mockResolvedValue(mockShipper as any);

    // Redis: lock matches
    vi.mocked(redis.get).mockImplementation(async (key) => {
      if (key === 'order:pending_accept:mock-order-id') return 'shipper-1';
      if (key === 'order:candidates:mock-order-id') return JSON.stringify([
        { shipperId: 'shipper-2', distanceMeters: 800, durationSeconds: 180, coordinates: [] }
      ]);
      return null;
    });

    const result = await dispatcherService.handleShipperResponse('mock-order-id', 'shipper-1', 'reject');

    expect(result.success).toBe(true);

    // Verify cooldown is set for shipper-1 (15 minutes = 900s)
    expect(redis.set).toHaveBeenCalledWith('shipper:cooldown:shipper-1', '1', 'EX', 900);

    // Verify reject notification sent
    expect(notificationService.sendRejectConfirm).toHaveBeenCalledWith(mockShipper, 'mock-order-id');

    // Verify next candidate is popped and offered (order status WAITING_ACCEPTANCE again)
    expect(prisma.order.update).toHaveBeenCalledWith({
      where: { id: 'mock-order-id' },
      data: { status: 'WAITING_ACCEPTANCE' },
    });
  });
});

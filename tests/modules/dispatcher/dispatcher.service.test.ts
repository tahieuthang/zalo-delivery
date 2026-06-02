import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as dispatcherService from '@modules/dispatcher/dispatcher.service';
import * as geoService from '@infra/redis/geo.service';
import { getRoute } from '@infra/osrm/osrm-client';
import * as orderService from '@modules/order/order.service';
import { producer } from '@infra/kafka/producer';
import { redis } from '@infra/redis/redis-client';

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

describe('Dispatcher Service Layer (Task 2.2 - 2.4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. should match and assign the closest shipper using OSRM driving durations', async () => {
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

    // Mock findNearby returning one candidate shipper
    vi.mocked(geoService.findNearby).mockResolvedValue([['shipper-1', '500']] as any);
    // Mock isShipperBusy returning false (shipper is free)
    vi.mocked(geoService.isShipperBusy).mockResolvedValue(false);
    // Mock redis.geopos returning coordinates
    vi.mocked(redis.geopos).mockResolvedValue([['106.700', '10.775']] as any);
    // Mock OSRM getRoute returning driving route details
    vi.mocked(getRoute).mockResolvedValue({
      distanceMeters: 600,
      durationSeconds: 120,
      coordinates: [[106.700, 10.775], [106.701, 10.776]],
    });

    await dispatcherService.dispatchOrder(mockEvent);

    // Verify DB update
    expect(orderService.assignOrder).toHaveBeenCalledWith('mock-order-id', 'shipper-1');
    // Verify shipper is marked busy
    expect(geoService.markShipperBusy).toHaveBeenCalledWith('shipper-1');
    // Verify route details saved to Redis
    expect(redis.set).toHaveBeenCalledWith(
      'tracking:route:mock-order-id',
      JSON.stringify([[106.700, 10.775], [106.701, 10.776]]),
      'EX',
      240,
    );
    // Verify Kafka event published
    expect(producer.send).toHaveBeenCalled();
  });

  it('2. should increment retry counter when no shippers are online', async () => {
    const mockEvent = {
      version: 1,
      eventType: 'order.created',
      payload: {
        orderId: 'mock-order-id',
        pickupLat: 10.776,
        pickupLng: 106.701,
      },
    };

    // No shippers nearby
    vi.mocked(geoService.findNearby).mockResolvedValue([] as any);
    vi.mocked(redis.get).mockResolvedValue('0'); // Start from 0 retries

    await dispatcherService.dispatchOrder(mockEvent);

    // Verify retry count updated in Redis
    expect(redis.set).toHaveBeenCalledWith('order:retry:mock-order-id', '1', 'EX', 300);
    // Order is not marked NO_SHIPPER immediately on first attempt
    expect(orderService.setOrderNoShipper).not.toHaveBeenCalled();
  });
});

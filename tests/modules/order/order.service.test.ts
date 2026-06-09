import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as orderService from '@modules/order/order.service';
import * as orderRepo from '@modules/order/order.repository';

vi.mock('@modules/order/order.repository');

describe('Order Service Layer - Phase 7 Filtering & Pagination', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should call findAndCount with correct parsed filters and return pagination meta', async () => {
    const mockData = [
      {
        id: '1',
        customerId: 'customer-1',
        pickupAddress: 'Pickup 1',
        pickupLat: 10.1,
        pickupLng: 106.1,
        deliveryAddress: 'Delivery 1',
        deliveryLat: 10.2,
        deliveryLng: 106.2,
        status: 'PENDING',
        note: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      },
    ];

    vi.mocked(orderRepo.findAndCount).mockResolvedValue({
      total: 1,
      data: mockData as any,
    });

    const filter = {
      status: 'PENDING,ASSIGNED',
      shipperId: 'shipper-123',
      from: '2026-06-01T00:00:00.000Z',
      to: '2026-06-10T00:00:00.000Z',
      page: '2',
      limit: '5',
    };

    const result = await orderService.getOrders(filter);

    expect(orderRepo.findAndCount).toHaveBeenCalledWith({
      statuses: ['PENDING', 'ASSIGNED'],
      shipperId: 'shipper-123',
      from: new Date('2026-06-01T00:00:00.000Z'),
      to: new Date('2026-06-10T00:00:00.000Z'),
      skip: 5,
      take: 5,
    });

    expect(result.meta).toEqual({
      total: 1,
      page: 2,
      limit: 5,
      totalPages: 1,
    });
    expect(result.data.length).toBe(1);
    expect(result.data[0].id).toBe('1');
  });

  it('should throw error when invalid date is provided', async () => {
    await expect(
      orderService.getOrders({ from: 'invalid-date' })
    ).rejects.toThrow('Tham số "from" không đúng định dạng ngày tháng');
  });
});

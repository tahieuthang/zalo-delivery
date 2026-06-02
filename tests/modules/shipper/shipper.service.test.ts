import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as shipperService from '@modules/shipper/shipper.service';
import * as shipperRepo from '@modules/shipper/shipper.repository';
import * as geoService from '@infra/redis/geo.service';

vi.mock('@modules/shipper/shipper.repository');
vi.mock('@infra/redis/geo.service');

describe('Shipper Service Layer (Task 2.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. should create a shipper in OFFLINE status', async () => {
    const mockShipper = {
      id: '01ARR83H8RA83R83RA83R83R83',
      name: 'Shipper A',
      phone: '0912345678',
      vehicleType: 'MOTORBIKE',
      status: 'OFFLINE',
      totalEarnings: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    vi.mocked(shipperRepo.create).mockResolvedValue(mockShipper as any);

    const result = await shipperService.createShipper({
      name: 'Shipper A',
      phone: '0912345678',
      vehicleType: 'MOTORBIKE',
    });

    expect(result.id).toBeDefined();
    expect(result.status).toBe('OFFLINE');
    expect(shipperRepo.create).toHaveBeenCalled();
  });

  it('2. should get shipper by ID', async () => {
    const mockShipper = {
      id: '01ARR83H8RA83R83RA83R83R83',
      name: 'Shipper A',
      phone: '0912345678',
      vehicleType: 'MOTORBIKE',
      status: 'OFFLINE',
      totalEarnings: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    vi.mocked(shipperRepo.findById).mockResolvedValue(mockShipper as any);

    const result = await shipperService.getShipperById('01ARR83H8RA83R83RA83R83R83');

    expect(result.id).toBe('01ARR83H8RA83R83RA83R83R83');
    expect(shipperRepo.findById).toHaveBeenCalledWith('01ARR83H8RA83R83RA83R83R83');
  });

  it('3. should toggle shipper status to ONLINE and update Redis location', async () => {
    const mockShipper = {
      id: '01ARR83H8RA83R83RA83R83R83',
      name: 'Shipper A',
      phone: '0912345678',
      vehicleType: 'MOTORBIKE',
      status: 'OFFLINE',
      totalEarnings: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const mockShipperOnline = {
      ...mockShipper,
      status: 'ONLINE',
    };

    vi.mocked(shipperRepo.findById).mockResolvedValue(mockShipper as any);
    vi.mocked(shipperRepo.update).mockResolvedValue(mockShipperOnline as any);

    const result = await shipperService.toggleStatus('01ARR83H8RA83R83RA83R83R83', {
      status: 'ONLINE',
      lat: 10.776,
      lng: 106.701,
    });

    expect(result.status).toBe('ONLINE');
    expect(geoService.addShipperLocation).toHaveBeenCalledWith('01ARR83H8RA83R83RA83R83R83', 106.701, 10.776);
  });

  it('4. should toggle shipper status to OFFLINE and remove from Redis', async () => {
    const mockShipper = {
      id: '01ARR83H8RA83R83RA83R83R83',
      name: 'Shipper A',
      phone: '0912345678',
      vehicleType: 'MOTORBIKE',
      status: 'ONLINE',
      totalEarnings: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const mockShipperOffline = {
      ...mockShipper,
      status: 'OFFLINE',
    };

    vi.mocked(shipperRepo.findById).mockResolvedValue(mockShipper as any);
    vi.mocked(shipperRepo.update).mockResolvedValue(mockShipperOffline as any);

    const result = await shipperService.toggleStatus('01ARR83H8RA83R83RA83R83R83', {
      status: 'OFFLINE',
    });

    expect(result.status).toBe('OFFLINE');
    expect(geoService.removeShipperLocation).toHaveBeenCalledWith('01ARR83H8RA83R83RA83R83R83');
    expect(geoService.markShipperFree).toHaveBeenCalledWith('01ARR83H8RA83R83RA83R83R83');
  });
});

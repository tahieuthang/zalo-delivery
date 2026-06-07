import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processWebhook } from '@modules/webhook/webhook.service';
import { prisma } from '@infra/database/prisma-client';
import { isNew } from '@infra/redis/dedup.service';
import { handleShipperResponse } from '@modules/dispatcher/dispatcher.service';

vi.mock('@infra/database/prisma-client', () => ({
  prisma: {
    shipper: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    order: {
      create: vi.fn(),
    },
    messageLog: {
      create: vi.fn(),
    },
  },
}));

vi.mock('@config/env.config', () => ({
  env: {
    ZALO_APP_SECRET: undefined,
  },
}));

vi.mock('@infra/redis/dedup.service', () => ({
  isNew: vi.fn().mockResolvedValue(true),
}));

vi.mock('@modules/dispatcher/dispatcher.service', () => ({
  handleShipperResponse: vi.fn().mockResolvedValue({ success: true }),
}));

describe('Webhook Service Integration (Task 6.2 & 6.5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should process a follow event and link follower to shipper', async () => {
    const mockShipper = { id: 'shipper-1', name: 'Shipper A', zaloUserId: null };
    vi.mocked(prisma.shipper.findFirst).mockResolvedValue(mockShipper as any);
    vi.mocked(prisma.shipper.update).mockResolvedValue({ ...mockShipper, zaloUserId: 'zalo-follower-1' } as any);

    const payload = {
      app_id: 'app-123',
      event_name: 'follow',
      follower: { id: 'zalo-follower-1' },
      timestamp: '1234567890',
    };

    const result = await processWebhook(payload as any, '{}', 'dummy-sig');

    expect(result.processed).toBe(true);
    expect(result.reason).toBe('follower_linked_to_shipper');
    expect(prisma.shipper.update).toHaveBeenCalledWith({
      where: { id: 'shipper-1' },
      data: { zaloUserId: 'zalo-follower-1' },
    });
  });

  it('should handle shipper accept response via button payload', async () => {
    const mockShipper = { id: 'shipper-1', name: 'Shipper A', zaloUserId: 'zalo-shipper-1' };
    vi.mocked(prisma.shipper.findUnique).mockResolvedValue(mockShipper as any);

    const payload = {
      app_id: 'app-123',
      event_name: 'user_send_text',
      sender: { id: 'zalo-shipper-1' },
      message: {
        msg_id: 'msg-1',
        text: '#accept:order-123',
      },
      timestamp: '1234567890',
    };

    const result = await processWebhook(payload as any, '{}', 'dummy-sig');

    expect(result.processed).toBe(true);
    expect(result.reason).toBe('shipper_accept_processed');
    expect(handleShipperResponse).toHaveBeenCalledWith('order-123', 'shipper-1', 'accept');
  });
});

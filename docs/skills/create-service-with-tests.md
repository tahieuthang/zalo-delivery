# Skill: create-service-with-tests

## Description
Tạo một service mới trong module theo kiến trúc Module thuần túy, kèm theo unit test đầy đủ. Service là nơi duy nhất chứa business logic; test mock các dependency (repository, infra) để test logic thuần.

---

## Trigger
Khi cần thêm business logic mới vào một module.

---

## Template Service

```typescript
// src/modules/order/order.service.ts
import { ulid } from '@shared/utils/id-generator';
import { AppError } from '@shared/errors/app-error';
import { ERROR_CODES } from '@shared/errors/error-codes';
import { producer } from '@infra/kafka/producer';
import { KAFKA_TOPICS } from '@infra/kafka/topics';
import * as orderRepo from './order.repository';
import type { CreateOrderInput, OrderResponse } from './order.types';

export async function createOrder(input: CreateOrderInput): Promise<OrderResponse> {
  const id = ulid();

  // Business validation
  if (!input.pickupAddress || !input.deliveryAddress) {
    throw new AppError(400, ERROR_CODES.INVALID_INPUT, 'Địa chỉ không hợp lệ');
  }

  const order = await orderRepo.createOrder({ id, ...input, status: 'PENDING' });

  // Publish event
  await producer.send({
    topic: KAFKA_TOPICS.ORDER_CREATED,
    messages: [{
      key: id,
      value: JSON.stringify({
        version: 1,
        eventType: 'order.created',
        payload: { orderId: id, ...input },
        metadata: { correlationId: ulid(), timestamp: new Date().toISOString() },
      }),
    }],
  });

  return { id: order.id, status: order.status, createdAt: order.createdAt.toISOString() };
}

export async function getOrderById(id: string): Promise<OrderResponse> {
  const order = await orderRepo.findOrderById(id);
  if (!order) throw new AppError(404, ERROR_CODES.NOT_FOUND, `Order ${id} không tồn tại`);
  return { id: order.id, status: order.status, createdAt: order.createdAt.toISOString() };
}
```

---

## Template Unit Test

```typescript
// tests/unit/order.service.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock các module trước khi import service
vi.mock('@modules/order/order.repository', () => ({
  createOrder: vi.fn(),
  findOrderById: vi.fn(),
}));

vi.mock('@infra/kafka/producer', () => ({
  producer: { send: vi.fn() },
}));

// Import sau khi mock
import * as orderRepo from '@modules/order/order.repository';
import { producer } from '@infra/kafka/producer';
import { createOrder, getOrderById } from '@modules/order/order.service';

describe('order.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createOrder', () => {
    it('should create order and publish Kafka event', async () => {
      const mockOrder = {
        id: '01J1234',
        status: 'PENDING',
        createdAt: new Date(),
      };
      vi.mocked(orderRepo.createOrder).mockResolvedValue(mockOrder as any);
      vi.mocked(producer.send).mockResolvedValue(undefined as any);

      const result = await createOrder({
        customerId: 'cust-01',
        pickupAddress: '123 Lê Lợi, Q1',
        deliveryAddress: '456 Nguyễn Huệ, Q1',
      });

      expect(result.status).toBe('PENDING');
      expect(orderRepo.createOrder).toHaveBeenCalledOnce();
      expect(producer.send).toHaveBeenCalledWith(
        expect.objectContaining({ topic: 'order.created' })
      );
    });

    it('should throw AppError if address is invalid', async () => {
      await expect(
        createOrder({ customerId: 'c1', pickupAddress: '', deliveryAddress: '' })
      ).rejects.toThrow('Địa chỉ không hợp lệ');
    });
  });

  describe('getOrderById', () => {
    it('should throw 404 if order not found', async () => {
      vi.mocked(orderRepo.findOrderById).mockResolvedValue(null);
      await expect(getOrderById('not-exist')).rejects.toMatchObject({ statusCode: 404 });
    });
  });
});
```

---

## Checklist
- [ ] Service chỉ import từ `repository`, `infra/`, và `shared/`
- [ ] Không có logic trong `controller` hay `repository`
- [ ] AppError được dùng cho mọi business error
- [ ] Test mock `repository` và `infra` (không test chúng)
- [ ] `vi.clearAllMocks()` trong `beforeEach`
- [ ] Cả happy path lẫn error case đều được test
- [ ] File test đặt tại `tests/unit/{module}.service.test.ts`

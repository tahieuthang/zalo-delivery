# Skill: create-module

## Description
Tạo một module mới hoàn chỉnh trong `src/modules/` theo kiến trúc Module thuần túy (phẳng). Mỗi module tự quản lý controller, service, repository, dto, và types của mình.

---

## Trigger
Khi cần thêm một module nghiệp vụ mới vào hệ thống.

---

## Steps

1. Tạo thư mục module và các file cơ bản:
   ```
   src/modules/{module-name}/
   ├── {module}.controller.ts   # HTTP handler — không chứa business logic
   ├── {module}.service.ts      # Business logic duy nhất của module
   ├── {module}.repository.ts   # DB queries (Prisma) — chỉ khi cần DB
   ├── {module}.consumer.ts     # Kafka consumer — chỉ khi cần nhận event
   ├── {module}.dto.ts          # Zod schemas cho request/response/event
   ├── {module}.types.ts        # TypeScript types (infer từ Zod hoặc định nghĩa thủ công)
   └── index.ts                 # Barrel export + Express Router + initModule()
   ```

2. Viết `{module}.dto.ts` trước — đây là source of truth cho shape dữ liệu:
   ```typescript
   import { z } from 'zod';

   export const CreateOrderDto = z.object({
     customerId: z.string().ulid(),
     pickupAddress: z.string().min(5),
     deliveryAddress: z.string().min(5),
   });

   export const OrderResponseDto = z.object({
     id: z.string(),
     status: z.enum(['PENDING', 'ASSIGNED', 'SUCCESS']),
     createdAt: z.string().datetime(),
   });
   ```

3. Viết `{module}.types.ts` — infer từ Zod:
   ```typescript
   import { z } from 'zod';
   import { CreateOrderDto, OrderResponseDto } from './order.dto';

   export type CreateOrderInput = z.infer<typeof CreateOrderDto>;
   export type OrderResponse = z.infer<typeof OrderResponseDto>;

   export type OrderStatus = 'PENDING' | 'ASSIGNED' | 'DELIVERING' | 'SUCCESS' | 'FAILED';
   ```

4. Viết `{module}.repository.ts` (nếu cần DB):
   ```typescript
   import { prisma } from '@infra/database/prisma-client';
   import type { CreateOrderInput } from './order.types';

   export async function createOrder(data: CreateOrderInput & { id: string }) {
     return prisma.order.create({ data });
   }

   export async function findOrderById(id: string) {
     return prisma.order.findUnique({ where: { id } });
   }
   ```

5. Viết `{module}.service.ts` — toàn bộ business logic ở đây:
   ```typescript
   import { ulid } from '@shared/utils/id-generator';
   import { AppError } from '@shared/errors/app-error';
   import * as orderRepo from './order.repository';
   import type { CreateOrderInput, OrderResponse } from './order.types';

   export async function createOrder(input: CreateOrderInput): Promise<OrderResponse> {
     const id = ulid();
     const order = await orderRepo.createOrder({ ...input, id });
     // publish Kafka event, gọi geocoding, v.v.
     return { id: order.id, status: order.status, createdAt: order.createdAt.toISOString() };
   }
   ```

6. Viết `{module}.controller.ts`:
   ```typescript
   import { Router, Request, Response, NextFunction } from 'express';
   import { validate } from '@shared/middleware/validate';
   import { CreateOrderDto } from './order.dto';
   import * as orderService from './order.service';

   export const orderRouter = Router();

   orderRouter.post('/', validate(CreateOrderDto), async (req: Request, res: Response, next: NextFunction) => {
     try {
       const result = await orderService.createOrder(req.body);
       res.status(201).json(result);
     } catch (err) {
       next(err);
     }
   });
   ```

7. Viết `index.ts` — barrel export và module init:
   ```typescript
   import { Router } from 'express';
   import { orderRouter } from './order.controller';
   import { startOrderConsumer } from './order.consumer'; // nếu có

   export const router = Router();
   router.use('/orders', orderRouter);

   export async function initModule() {
     await startOrderConsumer(); // khởi động Kafka consumer nếu cần
   }

   export * from './order.types';
   ```

8. Mount vào route aggregator `src/routes/index.ts`:
   ```typescript
   import { router as orderRouter, initModule as initOrder } from '@modules/order';
   app.use('/api', orderRouter);
   await initOrder();
   ```

---

## Checklist
- [ ] `dto.ts` được tạo trước (source of truth)
- [ ] `types.ts` infer từ Zod schemas
- [ ] `controller.ts` không chứa business logic
- [ ] `repository.ts` không chứa business logic (chỉ query)
- [ ] `service.ts` là nơi duy nhất chứa logic
- [ ] `index.ts` export `router` và `initModule()`
- [ ] Routes mounted trong `src/routes/index.ts`
- [ ] Không import file nội bộ của module khác trực tiếp

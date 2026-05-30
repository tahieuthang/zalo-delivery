# Skill: api-design

## Description
Thiết kế và implement REST API endpoint mới trong một module theo chuẩn của dự án: validate input với Zod DTO, controller gọi service, trả response nhất quán, xử lý lỗi qua global error handler.

---

## Trigger
Khi cần thêm một hoặc nhiều REST endpoint mới vào module.

---

## Nguyên tắc thiết kế

| Nguyên tắc | Mô tả |
|---|---|
| Thin controller | Controller chỉ validate → gọi service → trả response |
| DTO là source of truth | Shape request/response định nghĩa 1 lần trong `{module}.dto.ts` |
| Lỗi qua global handler | Controller không tự gửi error response — dùng `next(err)` |
| HTTP status chuẩn | `201` tạo mới, `200` đọc/update, `204` xóa, `4xx` lỗi client |
| Consistent response shape | Mọi response thành công có `data`, lỗi có `error` và `code` |

---

## Cấu trúc response chuẩn

```typescript
// Thành công
{ "data": { ... } }

// Lỗi
{ "error": "Không tìm thấy đơn hàng", "code": "NOT_FOUND" }
```

---

## Template DTO (Zod schemas)

```typescript
// src/modules/order/order.dto.ts
import { z } from 'zod';

// Request DTOs
export const CreateOrderDto = z.object({
  customerId: z.string().min(1),
  pickupAddress: z.string().min(5, 'Địa chỉ lấy hàng quá ngắn'),
  deliveryAddress: z.string().min(5, 'Địa chỉ giao hàng quá ngắn'),
  note: z.string().max(200).optional(),
});

export const UpdateOrderStatusDto = z.object({
  status: z.enum(['DELIVERING', 'SUCCESS', 'FAILED']),
});

// Query params DTOs
export const GetOrdersQueryDto = z.object({
  status: z.enum(['PENDING', 'ASSIGNED', 'DELIVERING', 'SUCCESS', 'FAILED']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// Response DTOs
export const OrderResponseDto = z.object({
  id: z.string(),
  status: z.string(),
  pickupAddress: z.string(),
  deliveryAddress: z.string(),
  createdAt: z.string().datetime(),
});
```

---

## Template Controller

```typescript
// src/modules/order/order.controller.ts
import { Router, Request, Response, NextFunction } from 'express';
import { validate, validateQuery } from '@shared/middleware/validate';
import {
  CreateOrderDto,
  UpdateOrderStatusDto,
  GetOrdersQueryDto,
} from './order.dto';
import * as orderService from './order.service';

export const orderRouter = Router();

// POST /api/orders
orderRouter.post(
  '/',
  validate(CreateOrderDto),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const order = await orderService.createOrder(req.body);
      res.status(201).json({ data: order });
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/orders/:id
orderRouter.get(
  '/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const order = await orderService.getOrderById(req.params.id);
      res.json({ data: order });
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/orders?status=PENDING&page=1&limit=20
orderRouter.get(
  '/',
  validateQuery(GetOrdersQueryDto),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await orderService.listOrders(req.query as any);
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  },
);

// PATCH /api/orders/:id/status
orderRouter.patch(
  '/:id/status',
  validate(UpdateOrderStatusDto),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const order = await orderService.updateStatus(req.params.id, req.body.status);
      res.json({ data: order });
    } catch (err) {
      next(err);
    }
  },
);
```

---

## Template Validate Middleware

```typescript
// src/shared/middleware/validate.ts
import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

export function validate(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return next(formatZodError(result.error));
    }
    req.body = result.data; // replace với parsed + coerced data
    next();
  };
}

export function validateQuery(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      return next(formatZodError(result.error));
    }
    req.query = result.data as any;
    next();
  };
}

function formatZodError(error: ZodError) {
  const err = new Error('Validation failed') as any;
  err.statusCode = 400;
  err.code = 'VALIDATION_ERROR';
  err.details = error.flatten().fieldErrors;
  return err;
}
```

---

## Checklist
- [ ] DTO (Zod schema) được tạo trong `{module}.dto.ts` trước
- [ ] Request body validate qua `validate()` middleware
- [ ] Query params validate qua `validateQuery()` middleware
- [ ] Controller không chứa logic, chỉ `try/catch` → `next(err)`
- [ ] Response thành công: `{ data: ... }`
- [ ] Dùng HTTP status đúng: `201` cho tạo mới
- [ ] Router được mount trong `index.ts` của module
- [ ] Route path được mount trong `src/routes/index.ts`

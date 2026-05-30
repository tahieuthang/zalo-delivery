# 📏 Zalo-Delivery — Coding Rules & Conventions

> Bộ rules này dùng để hướng dẫn cả developer lẫn AI agent khi làm việc trên project.

---

## 1. Kiến trúc & Module Rules

```
RULE-A01: Mỗi module trong modules/ phải có đủ các file: controller, service, dto, types, index.ts
RULE-A02: Module nào cần DB phải có thêm file repository.ts
RULE-A03: Module nào cần nhận Kafka event phải có thêm file consumer.ts
RULE-A04: controller.ts KHÔNG chứa business logic — chỉ validate input, gọi service, trả response
RULE-A05: repository.ts KHÔNG chứa business logic — chỉ thực hiện DB queries
RULE-A06: service.ts là nơi DUY NHẤT chứa business logic của module
RULE-A07: Cross-module communication chỉ qua Kafka events hoặc inject service, KHÔNG import file nội bộ của module khác
RULE-A08: Mỗi module PHẢI có file index.ts export router và initModule() function
RULE-A09: infra/ chứa các client dùng chung (Prisma, Redis, Kafka, OSRM) — không chứa business logic
RULE-A10: shared/ chứa các utility, middleware, error class dùng chung — không phụ thuộc module nào
```

## 2. Naming Conventions

| Loại | Pattern | Ví dụ |
|---|---|---|
| File controller | `{module}.controller.ts` | `order.controller.ts` |
| File service | `{module}.service.ts` | `order.service.ts` |
| File repository | `{module}.repository.ts` | `order.repository.ts` |
| File consumer (Kafka) | `{module}.consumer.ts` | `dispatcher.consumer.ts` |
| File socket handler | `{module}.socket.ts` | `tracking.socket.ts` |
| File DTO (Zod schemas) | `{module}.dto.ts` | `order.dto.ts` |
| File types | `{module}.types.ts` | `order.types.ts` |
| File config | `{name}.config.ts` | `redis.config.ts` |
| File test | `{name}.test.ts` | `order.service.test.ts` |
| Interface | `I{Name}` | `IOrderRepository` |
| Enum | `{Name}` (PascalCase) | `OrderStatus` |
| Kafka topic | `{module}.{event}` | `order.created`, `order.completed` |
| Redis key | `{module}:{purpose}:{id}` | `msg:dedup:abc123`, `shipper:locations` |
| Env variable | `SCREAMING_SNAKE_CASE` | `DATABASE_URL`, `KAFKA_BROKER` |

## 3. Code Style Rules

```
RULE-C01: Dùng Zod cho ALL validation (request body, env vars, external API responses)
RULE-C02: KHÔNG dùng `any` — dùng `unknown` + type guard nếu cần
RULE-C03: Mọi async function phải có try-catch hoặc được wrap bởi error handler
RULE-C04: Return early — tránh nested if/else sâu quá 3 levels
RULE-C05: Mọi magic number phải là named constant (VD: GEOFENCE_RADIUS_METERS = 20)
RULE-C06: Mỗi file KHÔNG quá 200 dòng — nếu quá thì tách
RULE-C07: Dùng pino cho logging, KHÔNG dùng console.log trong production code
RULE-C08: Mọi external call (OSRM, Geocoding, Zalo API) phải có timeout + retry
RULE-C09: Types trong {module}.types.ts ưu tiên infer từ Zod schema (z.infer<typeof Schema>)
```

## 4. Error Handling

```
RULE-E01: Mọi lỗi business phải throw AppError (không throw Error thuần)
RULE-E02: AppError phải có: statusCode, errorCode (enum), message, optional details
RULE-E03: Chỉ có global error handler middleware mới được gửi response lỗi về client
RULE-E04: Kafka consumer lỗi → retry 3 lần → đẩy vào DLQ → log error
RULE-E05: KHÔNG nuốt lỗi (catch rỗng) — ít nhất phải log
```

## 5. Database Rules

```
RULE-D01: KHÔNG viết raw SQL trong service layer — dùng ORM/Query builder (Prisma)
RULE-D02: Mọi write operation phải trong transaction khi involve > 1 table
RULE-D03: Mọi table phải có: id (ULID), created_at, updated_at
RULE-D04: Soft delete (deleted_at) cho orders và shippers — không hard delete
RULE-D05: Index cho: orders.status, orders.shipper_id, shippers.status, revenue.shipper_id
```

## 6. Redis Rules

```
RULE-R01: Mọi Redis key phải có TTL (trừ geo data của shipper online)
RULE-R02: Key pattern bắt buộc: {module}:{purpose}:{id}
RULE-R03: Dùng pipeline/multi cho batch operations
RULE-R04: Dedup dùng SET NX EX (atomic), KHÔNG dùng GET rồi SET
```

## 7. Kafka Rules

```
RULE-K01: Mọi event phải có Zod schema và version field
RULE-K02: Consumer phải idempotent — xử lý được message trùng
RULE-K03: Mỗi consumer group đặt tên theo module: {module}-service
RULE-K04: Graceful shutdown: commit offset trước khi tắt process
RULE-K05: Failed message → retry 3 → DLQ topic: {original-topic}.dlq
```

## 8. Testing Rules

```
RULE-T01: Unit test cho mọi service (file {module}.service.test.ts)
RULE-T02: Integration test cho mọi controller endpoint
RULE-T03: Mock external services (OSRM, Geocoding, Redis, Kafka) — không gọi thật trong test
RULE-T04: Test file đặt trong tests/ (mirror cấu trúc src/modules/)
RULE-T05: Minimum coverage: 80% cho service layer
```

## 9. Git & Workflow

```
RULE-G01: Branch naming: feature/{module}-{short-desc}, fix/{module}-{short-desc}
RULE-G02: Commit message: type(scope): description
         Ví dụ: feat(webhook): add message dedup with Redis
                fix(dispatcher): handle empty shipper list
RULE-G03: Mỗi PR tối đa 1 module — không mix cross-module changes
RULE-G04: Không commit .env, chỉ commit .env.example
```

## 10. Rules cho AI Agent

```
RULE-AI01: Đọc toàn bộ file liên quan TRƯỚC khi edit — hiểu context đầy đủ
RULE-AI02: KHÔNG tạo file ngoài cấu trúc đã define — hỏi nếu cần thêm
RULE-AI03: Mỗi lần tạo/sửa module, kiểm tra index.ts có cập nhật router chưa
RULE-AI04: Khi tạo service mới, PHẢI tạo kèm: dto.ts (Zod schema) + types.ts
RULE-AI05: Khi thêm Kafka event, PHẢI update topics.ts và tạo event schema trong dto.ts
RULE-AI06: Khi thêm Redis key mới, PHẢI document key pattern ở đầu file sử dụng
RULE-AI07: LUÔN kiểm tra xem đã có shared utility chưa trước khi viết mới
RULE-AI08: Giữ nguyên style: singleQuote, trailingComma 'all' (theo .prettierrc)
RULE-AI09: Khi tạo module mới, tạo đủ 5 file tối thiểu: controller, service, dto, types, index.ts
```

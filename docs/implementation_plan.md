# 🚀 Zalo-Delivery Backend — Implementation Plan

> **Stack**: ExpressJS + TypeScript | PostgreSQL | Redis | Kafka | Socket.io | OSRM Docker
> **Architecture**: Module Architecture (Phẳng, mỗi module chứa controller/service/repository/dto/types)

---

## 📋 Hiện trạng dự án

| Hạng mục | Trạng thái |
|---|---|
| Express + TS skeleton | ✅ Có (express, cors, dotenv) |
| README | ⚠️ Đang là template NestJS — cần viết lại |
| Source code | Chỉ có `src/index.ts` hello-world |
| Database / Redis / Kafka | ❌ Chưa có |
| pnpm-workspace | ⚠️ Có nhưng config sai (đang ref NestJS) |

> [!IMPORTANT]
> README và pnpm-workspace.yaml đang là template NestJS copy sang. Cần dọn sạch trước khi bắt đầu.

---

## Phase 0 — Foundation & Infrastructure (3-4 ngày)

### Task 0.1: Dọn dẹp & cấu hình project
- Xóa README NestJS, viết lại README cho zalo-delivery
- Fix `pnpm-workspace.yaml` (xóa ref NestJS)
- Thêm path aliases vào `tsconfig.json` (`@modules/*`, `@shared/*`, `@config/*`)
- Tạo `.env.example` với tất cả biến môi trường cần thiết

### Task 0.2: Docker Compose cho infra
- PostgreSQL 16
- Redis 7 (dùng chung cho cache + geospatial)
- Kafka + Zookeeper (hoặc KRaft mode)
- OSRM Docker (với map data VN — xem ghi chú bên dưới)

> [!TIP]
> **Gợi ý**: Dùng Kafka KRaft mode (không cần Zookeeper) — đơn giản hơn, ít container hơn. Kafka 3.7+ hỗ trợ KRaft production-ready.

### Task 0.3: Database layer
- Setup Prisma ORM (hoặc Drizzle ORM — xem ghi chú)
- Tạo schema: `orders`, `shippers`, `messages_log`, `revenue`
- Seed data cơ bản (shipper mẫu, config)

> [!TIP]
> **Gợi ý ORM**: Dùng **Drizzle ORM** hoặc **Prisma**. Vì chúng ta dùng kiến trúc module phẳng, cả Prisma hay Drizzle đều hỗ trợ rất tốt việc tổ chức database client tập trung tại `infra/database/prisma-client.ts` và import trực tiếp vào `{module}.repository.ts`.

### Task 0.4: Shared infrastructure code
- Logger (pino — nhanh hơn winston 5x)
- Error handling middleware (AppError class + global handler)
- Request validation (Zod schemas)
- Config loader (typed env with zod)
- Redis client singleton
- Kafka producer/consumer factory

### Task 0.5: Base Module structure
- Tạo cấu trúc thư mục chuẩn (xem file `project_structure.md`)
- Setup barrel exports (`index.ts`) cho mỗi module để export router và `initModule()`
- Khởi tạo router aggregator tại `src/routes/index.ts`

**✅ Acceptance**: `docker compose up` → tất cả services healthy, `pnpm dev` → server start không lỗi, kết nối được PG + Redis + Kafka.

---

## Phase 1 — Webhook & Message Parser (3-4 ngày)

### Task 1.1: Zalo Webhook endpoint
- `POST /api/webhooks/zalo` — nhận event từ Zalo
- Verify webhook signature (MAC verification)
- Parse event type: `user_send_text`, `user_send_image`, etc.
- Chỉ xử lý `user_send_text`, ignore phần còn lại

### Task 1.2: Redis dedup (chống trùng message)
- Key pattern: `webhook:dedup:{message_id}` với TTL 24h
- Flow: check EXISTS → nếu có thì skip, nếu không thì SET + xử lý
- Dùng `SET NX EX` (atomic operation) thay vì GET rồi SET

> [!NOTE]
> Dùng `SET key value NX EX 86400` — atomic, tránh race condition khi nhiều webhook đến cùng lúc.

### Task 1.3: Message Parser (Regex engine)
- Regex patterns cho: Tên, SĐT (VN format), Địa chỉ lấy/giao
- Xử lý multi-format: "Giao cho: Nguyễn Văn A - 0912345678 - 123 Lê Lợi Q1"
- Trả về `ParsedOrder` object hoặc `ParseFailure` (kèm raw message để review)
- Unit test cho ≥10 format tin nhắn phổ biến

> [!TIP]
> **Gợi ý nâng cao**: Thêm fallback layer dùng LLM (GPT-4o-mini / Gemini Flash) khi regex parse fail. Chi phí ~$0.001/tin nhắn, nhưng tăng accuracy lên đáng kể cho tin nhắn không chuẩn format. Implement dạng Strategy pattern để dễ bật/tắt.

### Task 1.4: Order creation
- Validate parsed data (Zod)
- Geocode địa chỉ → tọa độ (dùng Nominatim OSM hoặc Goong.io cho VN)
- Insert order vào PostgreSQL với status `PENDING` thông qua `order.repository.ts`
- Publish event `order.created` lên Kafka

> [!TIP]
> **Gợi ý Geocoding**: Dùng **Goong.io** thay Nominatim cho địa chỉ VN — chính xác hơn rất nhiều. Free tier 3000 req/ngày. Hoặc tự host **Pelias** với data VN nếu muốn self-hosted.

**✅ Acceptance**: Gửi POST giả lập webhook → parse đúng → order xuất hiện trong DB với status PENDING, message trùng bị skip.

---

## Phase 2 — Dispatcher & Route Optimization (4-5 ngày)

### Task 2.1: Shipper management
- CRUD shipper (tên, SĐT, vehicle type)
- API toggle online/offline: `PATCH /api/shippers/:id/status`
- Khi online → `GEOADD shipper:locations {lng} {lat} {shipper_id}` vào Redis
- Khi offline → `ZREM shipper:locations {shipper_id}`

### Task 2.2: Nearest shipper finder
- Nhận event `order.created` từ Kafka trong `dispatcher.consumer.ts`
- `GEORADIUS shipper:locations {order_lng} {order_lat} 3 km ASC`
- Lọc shipper đang không có đơn active (check DB hoặc Redis set `shipper:busy`)
- Trả về top 3-5 candidates

> [!TIP]
> **Gợi ý**: Dùng `GEOSEARCH` thay `GEORADIUS` (deprecated từ Redis 6.2). Syntax mới hơn, linh hoạt hơn.

### Task 2.3: OSRM route calculation
- Gọi OSRM HTTP API: `GET /route/v1/driving/{lng1},{lat1};{lng2},{lat2}?geometries=geojson&steps=true`
- Parse response → distance (m), duration (s), route geometry (coordinates array)
- So sánh thực tế distance/duration giữa các candidates
- Chọn shipper có route ngắn nhất (hoặc thời gian ngắn nhất)

### Task 2.4: Order assignment
- Update order: `status = ASSIGNED`, `shipper_id = X`
- Add shipper vào `shipper:busy` Redis set
- Lưu route geometry vào Redis (TTL = estimated_duration * 2)
- Publish event `order.assigned` lên Kafka
- Nếu không tìm được shipper → status = `NO_SHIPPER`, retry sau 30s (max 3 lần)

> [!TIP]
> **Gợi ý retry**: Dùng **BullMQ** (Redis-based) cho delayed retry thay vì setTimeout. Persistent, không mất job khi server restart, có dashboard UI.

**✅ Acceptance**: Tạo order → hệ thống tự tìm shipper gần nhất → gọi OSRM lấy route → gán shipper → order status = ASSIGNED.

---

## Phase 3 — Real-time Simulator Script (3-4 ngày)

### Task 3.1: Socket.io Gateway trên Server
- Setup Socket.io server tích hợp vào Express HTTP server
- Namespace `/tracking` cho GPS updates
- Events: `shipper:location_update`, `order:status_change`
- Auth middleware cho socket (JWT hoặc API key)
- Room per order: `order:{order_id}` (cho future frontend subscribe)

### Task 3.2: Simulator Script (standalone Node.js)
- File riêng: `src/scripts/shipper-simulator.ts`
- Nhận event `order.assigned` từ Kafka → lấy route geometry
- Decode route coordinates thành array `[lng, lat][]`
- Mỗi 2s: emit GPS point tiếp theo qua Socket.io client
- Hỗ trợ chạy nhiều shipper cùng lúc (Map<shipperId, intervalId>)

### Task 3.3: Server nhận GPS & update
- Nhận `shipper:location_update` trong `tracking.socket.ts` → update Redis GEOADD
- Broadcast location xuống room `order:{order_id}`
- Log trajectory vào PostgreSQL (batch insert mỗi 10 points để giảm write)

> [!TIP]
> **Gợi ý**: Thêm **interpolation** giữa các OSRM waypoints để chuyển động mượt hơn. OSRM trả ~50-200 points cho 1 route, interpolate lên 1 point/2s sẽ realistic hơn.

**✅ Acceptance**: Assign order → simulator tự chạy → GPS points stream qua socket → Redis location update realtime.

---

## Phase 4 — Geofencing & Order Completion (2-3 ngày)

### Task 4.1: Distance checker
- Mỗi khi nhận GPS update → tính khoảng cách tới điểm giao (Haversine formula)
- Hoặc dùng Redis `GEODIST shipper:{id} destination:{order_id}` (chính xác hơn)
- Threshold: ≤ 20m → trigger completion

### Task 4.2: Order completion flow
- Update order status → `DELIVERING` khi shipper bắt đầu di chuyển
- Update order status → `SUCCESS` khi distance ≤ 20m
- Timestamp `completed_at`
- Remove shipper khỏi `shipper:busy` set
- Xóa route data khỏi Redis
- Stop simulator interval cho shipper này

### Task 4.3: Revenue event
- Publish `order.completed` lên Kafka topic `revenue`
- Payload: `{ order_id, shipper_id, amount, completed_at }`

**✅ Acceptance**: Simulator chạy → shipper đến gần điểm giao ≤20m → order tự SUCCESS → event bắn sang Kafka.

---

## Phase 5 — Revenue Module & Kafka Integration (2-3 ngày)

### Task 5.1: Revenue consumer
- Subscribe Kafka topic `revenue` trong `revenue.consumer.ts`
- Consumer group: `revenue-service`
- Insert record vào bảng `revenue` thông qua `revenue.repository.ts`
- Update bảng `shippers.total_earnings`

### Task 5.2: Revenue API
- `GET /api/revenue/summary` — tổng doanh thu, số đơn
- `GET /api/revenue/shipper/:id` — doanh thu theo shipper
- `GET /api/revenue/daily?from=&to=` — doanh thu theo ngày
- Caching kết quả aggregate vào Redis (TTL 5 phút)

### Task 5.3: Kafka health & monitoring
- Dead Letter Queue (DLQ) cho failed messages
- Consumer lag monitoring endpoint
- Graceful shutdown: commit offset trước khi tắt

**✅ Acceptance**: Order SUCCESS → Kafka event → revenue record tạo → API trả doanh thu chính xác.

---

## Phase 6 — Polish & Hardening (2-3 ngày)

### Task 6.1: API documentation
- Swagger/OpenAPI spec tự động (swagger-jsdoc + swagger-ui-express)
- Hoặc dùng **Scalar** (UI đẹp hơn Swagger UI nhiều)

### Task 6.2: Testing
- Unit tests: Parser regex, Haversine calculation, business logic trong service (`{module}.service.test.ts`)
- Integration tests: Webhook flow end-to-end (supertest)
- Kafka tests: mock producer/consumer

### Task 6.3: Observability
- Health check endpoint: `/health` (PG, Redis, Kafka status)
- Request logging middleware (correlation ID)
- Metrics endpoint cho Prometheus (optional)

### Task 6.4: Security
- Rate limiting webhook endpoint (express-rate-limit)
- Helmet middleware
- Input sanitization
- Webhook signature verification

---

## 📊 Timeline tổng quan

| Phase | Thời gian | Mô tả |
|---|---|---|
| Phase 0 | 3-4 ngày | Foundation & Infrastructure |
| Phase 1 | 3-4 ngày | Webhook & Parser |
| Phase 2 | 4-5 ngày | Dispatcher & Routing |
| Phase 3 | 3-4 ngày | Realtime Simulator |
| Phase 4 | 2-3 ngày | Geofencing & Completion |
| Phase 5 | 2-3 ngày | Revenue & Kafka |
| Phase 6 | 2-3 ngày | Polish & Hardening |
| **Tổng** | **~19-26 ngày** | |

---

## 📎 Xem thêm
- [project_structure.md](file:///d:/My%20Project/zalo-delivery/docs/project_structure.md) — Cấu trúc thư mục chi tiết
- [rules.md](file:///d:/My%20Project/zalo-delivery/docs/rules.md) — Coding rules & conventions

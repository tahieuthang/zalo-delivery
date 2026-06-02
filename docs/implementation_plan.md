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

## Phase 1 — Webhook & Message Parser (3-4 ngày) — ✅ HOÀN THÀNH 100%

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

## Phase 2 — Dispatcher & Route Optimization (4-5 ngày) — ✅ HOÀN THÀNH 100%

### Task 2.1: Shipper management — ✅ HOÀN THÀNH
- CRUD shipper (tên, SĐT, vehicle type)
- API toggle online/offline: `PATCH /api/shippers/:id/status`
- Khi online → `GEOADD shipper:locations {lng} {lat} {shipper_id}` vào Redis
- Khi offline → `ZREM shipper:locations {shipper_id}`

### Task 2.2: Nearest shipper finder — ✅ HOÀN THÀNH
- Nhận event `order.created` từ Kafka trong `dispatcher.consumer.ts`
- `GEOSEARCH shipper:locations FROMLONLAT {order_lng} {order_lat} BYRADIUS 3 km ASC`
- Lọc shipper đang không có đơn active (check Redis set `shipper:busy`)
- Trả về top 3-5 candidates

> [!TIP]
> **Đã thực hiện**: Dùng `GEOSEARCH` thay `GEORADIUS` (deprecated từ Redis 6.2). Cú pháp chuẩn hóa, chính xác tuyệt đối.

### Task 2.3: OSRM route calculation — ✅ HOÀN THÀNH
- Gọi OSRM HTTP API: `GET /route/v1/driving/{lng1},{lat1};{lng2},{lat2}?geometries=geojson&steps=true`
- Parse response → distance (m), duration (s), route geometry (coordinates array)
- So sánh thực tế distance/duration giữa các candidates
- Chọn shipper có route ngắn nhất (hoặc thời gian ngắn nhất)

### Task 2.4: Order assignment — ✅ HOÀN THÀNH
- Update order: `status = ASSIGNED`, `shipper_id = X` via Prisma relations
- Add shipper vào `shipper:busy` Redis set
- Lưu route geometry vào Redis (TTL = estimated_duration * 2)
- Publish event `order.assigned` lên Kafka
- Nếu không tìm được shipper → status = `NO_SHIPPER`, retry sau 30s (max 3 lần) bằng hàng đợi retry bất đồng bộ với Redis tracking

**✅ Acceptance**: Tạo order → hệ thống tự tìm shipper gần nhất → gọi OSRM lấy route → gán shipper → order status = ASSIGNED.

> [!IMPORTANT]
> **Refactor trong Phase 2.5**: Flow auto-assign ở trên sẽ được thay đổi thành flow "gửi xác nhận qua Zalo OA" → shipper accept/reject → rồi mới chính thức assign. Logic tìm kiếm shipper (GEOSEARCH + OSRM) giữ nguyên.

---

## Phase 2.5 — Shipper Confirmation Flow (4-5 ngày)

> **Mục tiêu**: Xây dựng toàn bộ business logic accept/reject/timeout cho shipper confirmation. Dùng **Notification abstraction + mock provider** để test offline, không cần kết nối Zalo thật. Real Zalo OA integration sẽ thực hiện ở Phase 6.

> [!NOTE]
> **Tại sao mock-first?** Các Phase 1-2 đều hoạt động self-contained (mock webhook POST, OSRM commented out, Kafka/Redis local). Phase 2.5 giữ đúng pattern này: toàn bộ core logic được test qua REST API + console log, không phụ thuộc tài khoản Zalo OA thật.

### Task 2.5.1: Notification Abstraction Layer (`infra/notification/`)

Áp dụng **Strategy Pattern** — swap giữa mock và Zalo thật bằng env variable:

```
infra/notification/
├── notification.interface.ts     ← Interface chung: sendOrderOffer(), sendStatusUpdate()
├── console.notification.ts       ← Mock: log ra pino logger (dùng khi dev/test)
└── zalo-oa.notification.ts       ← Real: gửi qua Zalo OA API (implement ở Phase 6)
```

**Interface định nghĩa:**
```typescript
interface INotificationService {
  sendOrderOffer(shipper: ShipperInfo, order: OrderInfo): Promise<void>;
  sendAcceptConfirm(shipper: ShipperInfo, order: OrderInfo): Promise<void>;
  sendRejectConfirm(shipper: ShipperInfo, orderId: string): Promise<void>;
  sendTimeoutNotice(shipper: ShipperInfo, orderId: string): Promise<void>;
  sendDeliveringStatus(shipper: ShipperInfo, orderId: string): Promise<void>;
  sendSuccessStatus(shipper: ShipperInfo, orderId: string): Promise<void>;
}
```

**Chọn provider qua env:**
```
NOTIFICATION_PROVIDER=console    # dev/test (mặc định)
NOTIFICATION_PROVIDER=zalo       # production (Phase 6)
```

- `console.notification.ts`: Log tin nhắn ra pino ở level `info` với tag `[NOTIFICATION]`
- Factory function `createNotificationService()` trong `infra/notification/index.ts` trả về provider tương ứng

### Task 2.5.2: Bổ sung Database Schema

**Prisma schema changes:**

1. Thêm field `zaloUserId` vào model `Shipper`:
   ```prisma
   model Shipper {
     // ... existing fields
     zaloUserId  String?   @unique @map("zalo_user_id")
   }
   ```

2. Thêm trạng thái mới vào enum `OrderStatus`:
   ```prisma
   enum OrderStatus {
     PENDING
     WAITING_ACCEPTANCE   // ← MỚI: Đang chờ shipper xác nhận
     ASSIGNED
     DELIVERING
     SUCCESS
     FAILED
     NO_SHIPPER
   }
   ```

3. Migration: `prisma migrate dev --name add-shipper-zalo-uid-and-waiting-status`
4. API `PATCH /api/shippers/:id` cho phép cập nhật `zaloUserId` thủ công (chuẩn bị cho Phase 6)

### Task 2.5.3: Refactor Dispatcher — Shipper Confirmation Flow

Thay đổi flow chính trong `dispatcher.service.ts`:

**Luồng mới (thay thế auto-assign):**

```
1. Dispatcher tìm candidates (giữ nguyên GEOSEARCH + OSRM sort)
2. Lọc thêm: bỏ shipper có cooldown (shipper:cooldown:{id})
3. Lưu toàn bộ sorted candidates → Redis key order:candidates:{orderId}
4. Lấy candidate đầu tiên → gửi offer
5. Update order: status = WAITING_ACCEPTANCE
6. Lock order: SET order:pending_accept:{orderId} {shipperId} EX 30 NX
7. Gọi notificationService.sendOrderOffer(shipper, order)  ← abstracted
8. Khởi tạo timer 30s (setTimeout) → hết hạn = auto-reject
```

**Redis keys mới:**

| Key | Value | TTL | Mục đích |
|---|---|---|---|
| `order:pending_accept:{orderId}` | `{shipperId}` | 30s | Lock order — chỉ 1 shipper được offer tại 1 thời điểm |
| `shipper:cooldown:{shipperId}` | `"1"` | 900s (15 phút) | Treo shipper sau khi reject |
| `order:candidates:{orderId}` | JSON array `[{shipperId, duration, ...}]` | 300s | Cache danh sách candidates đã sort |

> [!TIP]
> **Tối ưu**: Lưu candidates vào Redis để khi bị reject, không cần gọi lại GEOSEARCH + OSRM mà chỉ lấy candidate tiếp theo. Tiết kiệm latency và API calls.

### Task 2.5.4: Shipper Response Handler

**Tạo REST API giả lập** (dùng để test khi chưa có Zalo thật):

```
POST /api/dispatcher/respond
Body: { "orderId": "xxx", "shipperId": "yyy", "action": "accept" | "reject" }
```

> Khi tích hợp Zalo thật (Phase 6), endpoint này vẫn giữ lại như fallback/admin tool. Zalo webhook callback sẽ gọi cùng service function bên dưới.

**Core service function** `handleShipperResponse(orderId, shipperId, action)`:

---

**🟢 Case ACCEPT:**

```
1. Lấy Redis key order:pending_accept:{orderId}
   → Không tồn tại → return { expired: true }
   → shipperId không khớp → return { unauthorized: true }
2. Hủy timer 30s (clearTimeout)
3. Xóa Redis key order:pending_accept:{orderId}
4. Update order: status = ASSIGNED, shipperId = X (qua Prisma)
5. SADD shipper:busy {shipperId}
6. Publish order.assigned lên Kafka
7. notificationService.sendAcceptConfirm(shipper, order)
8. Xóa order:candidates:{orderId}
```

---

**🔴 Case REJECT:**

```
1. Lấy Redis key order:pending_accept:{orderId}
   → Không tồn tại → return { expired: true }
   → shipperId không khớp → return { unauthorized: true }
2. Hủy timer 30s (clearTimeout)
3. Xóa Redis key order:pending_accept:{orderId}
4. SET shipper:cooldown:{shipperId} "1" EX 900 (treo 15 phút)
5. notificationService.sendRejectConfirm(shipper, orderId)
6. Lấy candidate tiếp theo từ order:candidates:{orderId}
   → Có candidate → lặp lại flow offer (Task 2.5.3 bước 4-8)
   → Hết candidates → update order status = NO_SHIPPER
```

---

**⏰ Case TIMEOUT (30s, tự động):**

```
1. Timer callback fire sau 30s
2. Kiểm tra order:pending_accept:{orderId} còn tồn tại
   → Không → shipper đã accept/reject trước đó → skip
3. Xóa Redis key order:pending_accept:{orderId}
4. notificationService.sendTimeoutNotice(shipper, orderId)
5. Lấy candidate tiếp theo từ order:candidates:{orderId}
   → Có candidate → lặp lại flow offer
   → Hết candidates → update order status = NO_SHIPPER
```

> [!WARNING]
> **Timer management**: `setTimeout` sẽ mất nếu server restart. Cho MVP đủ dùng. Production-ready cân nhắc thay bằng Bull/BullMQ delayed job hoặc Redis keyspace notification.

### Task 2.5.5: Status Notification Messages (định nghĩa template)

Định nghĩa bảng template tin nhắn — console provider sẽ log, Zalo provider (Phase 6) sẽ gửi thật:

| Sự kiện | Template tin nhắn | Trigger |
|---|---|---|
| Order offer | "📦 Đơn mới: {deliveryAddress} — {distance}km (~{duration} phút)" | Dispatcher chọn candidate |
| Accept | "✅ Đã nhận đơn #{orderId}. Lấy hàng tại: {pickupAddress}" | Shipper accept |
| Reject | "❌ Đã từ chối đơn #{orderId} — {timestamp}. Treo 15 phút." | Shipper reject |
| Timeout | "⏰ Hết hạn phản hồi đơn #{orderId}" | 30s không phản hồi |
| Delivering | "🚚 Đơn #{orderId} đang được giao..." | Bắt đầu di chuyển (Phase 4) |
| Success | "🎉 Giao thành công đơn #{orderId} lúc {HH:mm dd/MM}" | Order hoàn thành (Phase 4) |

### Cách test toàn bộ flow (Mock Mode)

```bash
# 1. Tạo order qua mock webhook
curl -X POST localhost:3000/api/webhooks/zalo -d '...'
# → Order PENDING → Kafka order.created → Dispatcher tìm shipper
# → Console log: [NOTIFICATION] 📦 Đơn mới cho shipper X
# → Order status = WAITING_ACCEPTANCE

# 2. Giả lập shipper accept
curl -X POST localhost:3000/api/dispatcher/respond \
  -d '{"orderId":"xxx","shipperId":"yyy","action":"accept"}'
# → Console log: [NOTIFICATION] ✅ Đã nhận đơn
# → Order status = ASSIGNED

# 3. Hoặc: không làm gì → 30s sau auto-timeout
# → Console log: [NOTIFICATION] ⏰ Hết hạn
# → Tìm candidate tiếp theo hoặc NO_SHIPPER
```

**✅ Acceptance**: Tạo order → dispatcher tìm shipper → log offer notification → gọi REST respond endpoint (accept/reject) → logic assign/cooldown/retry chạy đúng → timeout 30s tự reject → hết candidates → NO_SHIPPER. **Tất cả test được offline, không cần Zalo thật.**

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

### Task 6.5: Zalo OA Real Integration (Phần B — Shipper Confirmation)

> Đây là phần kết nối thật với Zalo OA, hoàn thiện tính năng Shipper Confirmation đã xây dựng core logic ở Phase 2.5.

**Yêu cầu trước khi bắt đầu:**
- [x] Phase 2.5 hoàn thành (core logic + mock provider hoạt động)
- [ ] Tài khoản Zalo OA đã xác thực (tích vàng)
- [ ] App đã đăng ký trên Zalo Developers portal
- [ ] Webhook URL public (ngrok/cloudflare tunnel cho dev)

**Implement `zalo-oa.notification.ts`:**
- Tạo `infra/zalo/zalo-oa-client.ts` — HTTP client gửi tin nhắn
  - Endpoint: `POST https://openapi.zalo.me/v3.0/oa/message/cs`
  - Tin text kèm buttons dùng `oa.query.hide` type
- Tạo `infra/zalo/zalo-token.service.ts` — Quản lý access token
  - Auto-refresh khi hết hạn (~24h), cache trong Redis `zalo:oa:access_token`
  - Refresh endpoint: `POST https://oauth.zaloapp.com/v4/oa/access_token`
- Implement `INotificationService` → gọi Zalo OA API thay vì console log
- Thêm env vars: `ZALO_OA_ACCESS_TOKEN`, `ZALO_OA_REFRESH_TOKEN`, `ZALO_OA_SECRET_KEY`
- Validate response bằng Zod, timeout 5s + retry 2 lần

**Cấu trúc tin nhắn Zalo OA kèm buttons:**
```json
{
  "recipient": { "user_id": "SHIPPER_ZALO_UID" },
  "message": {
    "text": "📦 Đơn hàng mới!\nGiao đến: 123 Lê Lợi, Q1\nKhoảng cách: 1.2km (~4 phút)\nBạn có 30 giây để phản hồi.",
    "attachment": {
      "type": "template",
      "payload": {
        "buttons": [
          { "title": "✅ Nhận đơn", "type": "oa.query.hide", "payload": "#accept:{orderId}" },
          { "title": "❌ Từ chối", "type": "oa.query.hide", "payload": "#reject:{orderId}" }
        ]
      }
    }
  }
}
```

**Mở rộng webhook handler:**
- Phân biệt webhook từ khách hàng (parse order) vs shipper (callback `#accept:` / `#reject:`)
- Callback buttons → gọi `handleShipperResponse()` đã có từ Phase 2.5
- Auto-capture `zaloUserId` khi shipper follow OA (webhook event `follow`)

> [!NOTE]
> **Điều kiện Zalo OA**: OA phải xác thực (tích vàng), shipper phải follow OA, tin tư vấn chỉ gửi trong 7 ngày kể từ tương tác gần nhất.

> [!IMPORTANT]
> Zalo OA API **không hỗ trợ edit tin nhắn đã gửi**. Mỗi trạng thái thay đổi gửi **tin nhắn mới** (follow-up). Buttons cũ vẫn hiển thị nhưng server kiểm tra trạng thái và bỏ qua (idempotent).

**Chuyển đổi**: Đổi `NOTIFICATION_PROVIDER=zalo` trong `.env` → toàn bộ flow tự động dùng Zalo OA thay console.

**✅ Acceptance**: Swap sang Zalo provider → gửi tin nhắn Zalo thật kèm buttons → shipper bấm Accept/Reject trên Zalo app → webhook callback xử lý đúng → toàn bộ flow end-to-end hoạt động trên Zalo thật.

---

## 📊 Timeline tổng quan

| Phase | Thời gian | Mô tả |
|---|---|---|
| Phase 0 | 3-4 ngày | Foundation & Infrastructure |
| Phase 1 | 3-4 ngày | Webhook & Parser |
| Phase 2 | 4-5 ngày | Dispatcher & Routing |
| **Phase 2.5** | **4-5 ngày** | **Shipper Confirmation Flow (Mock Mode)** |
| Phase 3 | 3-4 ngày | Realtime Simulator |
| Phase 4 | 2-3 ngày | Geofencing & Completion |
| Phase 5 | 2-3 ngày | Revenue & Kafka |
| Phase 6 | 3-5 ngày | Polish, Hardening & Zalo OA Integration |
| **Tổng** | **~24-33 ngày** | |

---

## 📎 Xem thêm
- [project_structure.md](file:///d:/My%20Project/zalo-delivery/docs/project_structure.md) — Cấu trúc thư mục chi tiết
- [rules.md](file:///d:/My%20Project/zalo-delivery/docs/rules.md) — Coding rules & conventions

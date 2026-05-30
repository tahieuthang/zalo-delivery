# Skill: add-redis-integration

## Description
Tích hợp Redis vào service layer của module cho các tác vụ: message deduplication (chống trùng), geospatial search (tìm shipper gần nhất), và caching kết quả tính toán nặng.

---

## Trigger
Khi cần dùng Redis trong một module cho dedup, geo search, hoặc caching.

---

## Templates theo use case

### 1. Dedup — Chống trùng message
```typescript
// src/infra/redis/dedup.service.ts
import { redis } from './redis-client';

/**
 * Key pattern: {module}:dedup:{id}
 * Returns true nếu message là MỚI (chưa thấy bao giờ)
 * Dùng SET NX EX — atomic check-and-set, tránh race condition
 */
export async function isNew(namespace: string, id: string, ttlSeconds = 86400): Promise<boolean> {
  const result = await redis.set(
    `${namespace}:dedup:${id}`,
    '1',
    'EX', ttlSeconds,
    'NX',
  );
  return result === 'OK';
}
```

Dùng trong service:
```typescript
// src/modules/webhook/webhook.service.ts
import { isNew } from '@infra/redis/dedup.service';

export async function processWebhook(messageId: string, payload: unknown) {
  const fresh = await isNew('webhook', messageId);
  if (!fresh) return; // skip duplicate
  // tiếp tục xử lý...
}
```

---

### 2. Geospatial — Tìm shipper gần nhất
```typescript
// src/infra/redis/geo.service.ts
import { redis } from './redis-client';

const GEO_KEY = 'shipper:locations';

export async function addShipperLocation(shipperId: string, lng: number, lat: number) {
  await redis.geoadd(GEO_KEY, lng, lat, shipperId);
}

export async function removeShipper(shipperId: string) {
  await redis.zrem(GEO_KEY, shipperId);
}

export async function findNearby(lng: number, lat: number, radiusKm: number, limit = 5) {
  return redis.geosearch(
    GEO_KEY,
    'FROMLONLAT', lng, lat,
    'BYRADIUS', radiusKm, 'km',
    'ASC',
    'COUNT', limit,
    'WITHDIST',
  );
}

export async function getDistance(member1: string, member2: string): Promise<number | null> {
  const dist = await redis.geodist(GEO_KEY, member1, member2, 'm');
  return dist ? parseFloat(dist) : null;
}
```

---

### 3. Cache — Kết quả tính toán nặng (với TTL)
```typescript
// Dùng trực tiếp trong service, ví dụ revenue.service.ts
import { redis } from '@infra/redis/redis-client';

async function getCached<T>(key: string, ttlSeconds: number, factory: () => Promise<T>): Promise<T> {
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached) as T;

  const data = await factory();
  await redis.set(key, JSON.stringify(data), 'EX', ttlSeconds);
  return data;
}

// Ví dụ dùng trong revenue.service.ts:
export async function getRevenueSummary() {
  return getCached('revenue:summary:all', 300, async () => {
    return revenueRepo.aggregateSummary();
  });
}
```

---

### 4. Set — Quản lý trạng thái (shipper busy)
```typescript
// Thêm shipper vào busy set khi assign đơn
await redis.sadd('shipper:busy', shipperId);

// Xóa khỏi busy set khi hoàn thành
await redis.srem('shipper:busy', shipperId);

// Kiểm tra shipper có bận không
const isBusy = await redis.sismember('shipper:busy', shipperId) === 1;
```

---

## Checklist
- [ ] Key pattern theo chuẩn: `{module}:{purpose}:{id}`
- [ ] Mọi key đều có TTL (trừ geo data shipper đang online)
- [ ] Dedup dùng `SET NX EX` (không GET rồi SET)
- [ ] Batch operation dùng pipeline: `redis.pipeline().geoadd(...).exec()`
- [ ] Document key pattern ở đầu file sử dụng bằng comment

# 🧠 Zalo-Delivery — Bộ Skills gợi ý cho AI Agent

> Skills = bộ hướng dẫn có cấu trúc giúp AI agent thực hiện các tác vụ lặp đi lặp lại một cách nhất quán.

---

## Skill 1: Create New Module

**Trigger**: Khi cần tạo module mới trong `src/modules/`

**Steps**:
1. Tạo cấu trúc thư mục chuẩn:
   ```
   src/modules/{module-name}/
   ├── domain/
   │   ├── entities/
   │   ├── value-objects/    (nếu cần)
   │   ├── enums/            (nếu cần)
   │   └── events/           (nếu cần)
   ├── application/
   │   ├── use-cases/
   │   ├── services/         (nếu cần)
   │   └── ports/
   ├── adapters/
   │   └── {name}.controller.ts  (hoặc .consumer.ts, .socket-handler.ts)
   └── index.ts
   ```
2. Tạo entity chính trong `domain/entities/`
3. Tạo port interface trong `application/ports/`
4. Tạo ít nhất 1 use case trong `application/use-cases/`
5. Tạo adapter (controller/consumer) trong `adapters/`
6. Tạo `index.ts` với factory function và barrel exports
7. Register routes trong `src/routes/index.ts`
8. Tạo infra repository trong `src/infra/database/repositories/` (nếu cần DB)

**Checklist**:
- [ ] Domain layer không import từ layer khác
- [ ] Ports defined cho mọi external dependency
- [ ] Barrel export (`index.ts`) đầy đủ
- [ ] Routes registered

---

## Skill 2: Add Kafka Event Flow

**Trigger**: Khi cần thêm event communication giữa modules

**Steps**:
1. Define event schema (Zod) trong `domain/events/`:
   ```typescript
   // order-created.event.ts
   import { z } from 'zod';

   export const OrderCreatedEventSchema = z.object({
     version: z.literal(1),
     eventType: z.literal('order.created'),
     payload: z.object({
       orderId: z.string(),
       pickupLat: z.number(),
       pickupLng: z.number(),
       deliveryLat: z.number(),
       deliveryLng: z.number(),
       createdAt: z.string().datetime(),
     }),
     metadata: z.object({
       correlationId: z.string(),
       timestamp: z.string().datetime(),
     }),
   });

   export type OrderCreatedEvent = z.infer<typeof OrderCreatedEventSchema>;
   ```

2. Register topic name trong `src/infra/kafka/topics.ts`:
   ```typescript
   export const KAFKA_TOPICS = {
     ORDER_CREATED: 'order.created',
     ORDER_ASSIGNED: 'order.assigned',
     ORDER_COMPLETED: 'order.completed',
     // ... thêm topic mới ở đây
   } as const;
   ```

3. Publish trong producer module (use case):
   ```typescript
   await this.eventPublisher.publish(KAFKA_TOPICS.ORDER_CREATED, {
     version: 1,
     eventType: 'order.created',
     payload: { ... },
     metadata: { correlationId: ulid(), timestamp: new Date().toISOString() },
   });
   ```

4. Subscribe trong consumer module (`adapters/{name}.consumer.ts`):
   ```typescript
   // dispatcher.consumer.ts
   export function createDispatcherConsumer(kafka: KafkaClient, deps: Deps) {
     return kafka.subscribe(
       KAFKA_TOPICS.ORDER_CREATED,
       'dispatcher-service',
       async (message) => {
         const event = OrderCreatedEventSchema.parse(message);
         await deps.findNearestShipperUseCase.execute(event.payload);
       }
     );
   }
   ```

5. Tạo DLQ handler cho topic: `{topic}.dlq`

**Checklist**:
- [ ] Event schema có `version` field
- [ ] Topic registered trong `topics.ts`
- [ ] Consumer là idempotent
- [ ] DLQ configured

---

## Skill 3: Add Redis Integration

**Trigger**: Khi cần dùng Redis cho cache, dedup, hoặc geospatial

**Templates theo use case**:

### Dedup (chống trùng)
```typescript
// src/infra/redis/dedup.service.ts
export class DedupService {
  constructor(private redis: Redis) {}

  /**
   * Returns true if message is NEW (not seen before)
   * Uses SET NX EX for atomic check-and-set
   */
  async isNew(messageId: string, ttlSeconds = 86400): Promise<boolean> {
    // SET key value NX EX ttl → returns 'OK' if set, null if exists
    const result = await this.redis.set(
      `msg:dedup:${messageId}`,
      '1',
      'EX', ttlSeconds,
      'NX',
    );
    return result === 'OK';
  }
}
```

### Geospatial (shipper nearby)
```typescript
// src/infra/redis/geo.service.ts
export class GeoService {
  constructor(private redis: Redis) {}

  async addShipperLocation(shipperId: string, lng: number, lat: number) {
    await this.redis.geoadd('shipper:locations', lng, lat, shipperId);
  }

  async removeShipper(shipperId: string) {
    await this.redis.zrem('shipper:locations', shipperId);
  }

  async findNearby(lng: number, lat: number, radiusKm: number, limit = 5) {
    return this.redis.geosearch(
      'shipper:locations',
      'FROMLONLAT', lng, lat,
      'BYRADIUS', radiusKm, 'km',
      'ASC',
      'COUNT', limit,
      'WITHDIST',
    );
  }

  async getDistance(member1: string, member2: string) {
    return this.redis.geodist('shipper:locations', member1, member2, 'm');
  }
}
```

### Cache (with TTL)
```typescript
async getCached<T>(key: string, ttl: number, factory: () => Promise<T>): Promise<T> {
  const cached = await this.redis.get(key);
  if (cached) return JSON.parse(cached) as T;
  const data = await factory();
  await this.redis.set(key, JSON.stringify(data), 'EX', ttl);
  return data;
}
```

---

## Skill 4: OSRM Route Integration

**Trigger**: Khi cần tính route đường phố thực tế

**Template**:
```typescript
// src/infra/osrm/osrm-client.ts
import { z } from 'zod';

const OSRM_BASE_URL = process.env.OSRM_URL || 'http://localhost:5000';

const OsrmRouteResponseSchema = z.object({
  code: z.literal('Ok'),
  routes: z.array(z.object({
    distance: z.number(),   // meters
    duration: z.number(),   // seconds
    geometry: z.object({
      type: z.literal('LineString'),
      coordinates: z.array(z.tuple([z.number(), z.number()])),
    }),
  })),
});

export type RouteResult = {
  distanceMeters: number;
  durationSeconds: number;
  coordinates: [number, number][];  // [lng, lat][]
};

export async function getRoute(
  from: { lng: number; lat: number },
  to: { lng: number; lat: number },
): Promise<RouteResult> {
  const url = `${OSRM_BASE_URL}/route/v1/driving/` +
    `${from.lng},${from.lat};${to.lng},${to.lat}` +
    `?geometries=geojson&overview=full&steps=true`;

  const res = await fetch(url, {
    signal: AbortSignal.timeout(5000),
  });

  const data = OsrmRouteResponseSchema.parse(await res.json());
  const route = data.routes[0];

  return {
    distanceMeters: route.distance,
    durationSeconds: route.duration,
    coordinates: route.geometry.coordinates,
  };
}
```

> [!NOTE]
> **OSRM Docker setup**: Cần download map data VN trước.
> ```bash
> # Download VN map (chạy 1 lần)
> wget https://download.geofabrik.de/asia/vietnam-latest.osm.pbf
> # OSRM pre-process (chạy 1 lần)
> docker run -t -v "${PWD}:/data" osrm/osrm-backend osrm-extract -p /opt/car.lua /data/vietnam-latest.osm.pbf
> docker run -t -v "${PWD}:/data" osrm/osrm-backend osrm-partition /data/vietnam-latest.osrm
> docker run -t -v "${PWD}:/data" osrm/osrm-backend osrm-customize /data/vietnam-latest.osrm
> # Run OSRM server
> docker run -t -p 5000:5000 -v "${PWD}:/data" osrm/osrm-backend osrm-routed --algorithm mld /data/vietnam-latest.osrm
> ```

---

## Skill 5: Create Use Case with Tests

**Trigger**: Khi cần tạo use case mới

**Template Use Case**:
```typescript
// src/modules/{module}/application/use-cases/{verb}-{noun}.use-case.ts
import { z } from 'zod';

// 1. Input/Output schemas
export const InputSchema = z.object({ /* ... */ });
export const OutputSchema = z.object({ /* ... */ });
type Input = z.infer<typeof InputSchema>;
type Output = z.infer<typeof OutputSchema>;

// 2. Port dependencies
interface Deps {
  orderRepository: IOrderRepository;
  eventPublisher: IEventPublisher;
}

// 3. Use case class
export class CreateOrderUseCase {
  constructor(private deps: Deps) {}

  async execute(input: Input): Promise<Output> {
    const validated = InputSchema.parse(input);
    // ... business logic
    return result;
  }
}
```

**Template Test**:
```typescript
// tests/unit/create-order.test.ts
describe('CreateOrderUseCase', () => {
  let useCase: CreateOrderUseCase;
  let mockRepo: jest.Mocked<IOrderRepository>;
  let mockPublisher: jest.Mocked<IEventPublisher>;

  beforeEach(() => {
    mockRepo = { save: jest.fn(), findById: jest.fn() };
    mockPublisher = { publish: jest.fn() };
    useCase = new CreateOrderUseCase({
      orderRepository: mockRepo,
      eventPublisher: mockPublisher,
    });
  });

  it('should create order and publish event', async () => {
    mockRepo.save.mockResolvedValue({ id: '1', status: 'PENDING' });
    const result = await useCase.execute({ /* input */ });
    expect(result.status).toBe('PENDING');
    expect(mockPublisher.publish).toHaveBeenCalledWith('order.created', expect.any(Object));
  });
});
```

---

## Skill 6: Docker Compose Setup

**Trigger**: Khi cần setup hoặc update infrastructure services

**Template**:
```yaml
# docker-compose.yml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    ports: ['5432:5432']
    environment:
      POSTGRES_DB: zalo_delivery
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U postgres']
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports: ['6379:6379']
    command: redis-server --save 60 1
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 5s

  kafka:
    image: apache/kafka:3.8.0
    ports: ['9092:9092']
    environment:
      KAFKA_NODE_ID: 1
      KAFKA_PROCESS_ROLES: broker,controller
      KAFKA_LISTENERS: PLAINTEXT://0.0.0.0:9092,CONTROLLER://0.0.0.0:9093
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://localhost:9092
      KAFKA_CONTROLLER_QUORUM_VOTERS: 1@localhost:9093
      KAFKA_CONTROLLER_LISTENER_NAMES: CONTROLLER
      KAFKA_LOG_DIRS: /tmp/kraft-logs
      CLUSTER_ID: 'zalo-delivery-cluster-001'

  osrm:
    image: osrm/osrm-backend
    ports: ['5000:5000']
    volumes:
      - ./osrm-data:/data
    command: osrm-routed --algorithm mld /data/vietnam-latest.osrm

volumes:
  pgdata:
```

---

## Tổng hợp Skills

| # | Skill | Khi nào dùng |
|---|---|---|
| 1 | Create New Module | Thêm module mới vào hệ thống |
| 2 | Add Kafka Event Flow | Thêm giao tiếp async giữa modules |
| 3 | Add Redis Integration | Dedup, geo search, caching |
| 4 | OSRM Route Integration | Tính tuyến đường thực tế |
| 5 | Create Use Case + Tests | Thêm business logic mới |
| 6 | Docker Compose Setup | Thêm/sửa infrastructure service |

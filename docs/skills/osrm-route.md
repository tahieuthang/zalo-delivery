# Skill: osrm-route

## Description
Tích hợp OSRM (Open Source Routing Machine) để tính tuyến đường lái xe thực tế giữa hai điểm. Bao gồm gọi HTTP API, parse response có Zod validation, và hướng dẫn setup Docker với map data Việt Nam.

---

## Trigger
Khi cần tính route đường phố thực tế (khoảng cách, thời gian, tọa độ hành trình) thay vì dùng Haversine (đường thẳng).

---

## Template

```typescript
// src/infra/osrm/osrm-client.ts
import { z } from 'zod';
import { env } from '@config/env.config';
import logger from '@shared/logger/logger';

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
  const url =
    `${env.OSRM_URL}/route/v1/driving/` +
    `${from.lng},${from.lat};${to.lng},${to.lat}` +
    `?geometries=geojson&overview=full&steps=true`;

  const res = await fetch(url, {
    signal: AbortSignal.timeout(5000), // 5s timeout
  });

  if (!res.ok) {
    logger.error({ url, status: res.status }, 'OSRM request failed');
    throw new Error(`OSRM error: ${res.status}`);
  }

  const data = OsrmRouteResponseSchema.parse(await res.json());
  const route = data.routes[0];

  return {
    distanceMeters: route.distance,
    durationSeconds: route.duration,
    coordinates: route.geometry.coordinates,
  };
}
```

Dùng trong `dispatcher.service.ts`:
```typescript
import { getRoute } from '@infra/osrm/osrm-client';

const route = await getRoute(
  { lng: pickupLng, lat: pickupLat },
  { lng: shipperLng, lat: shipperLat },
);

// Chọn shipper có durationSeconds ngắn nhất
```

---

## Docker Setup (chạy 1 lần)

```bash
# 1. Download map data VN
wget https://download.geofabrik.de/asia/vietnam-latest.osm.pbf

# 2. Pre-process (tạo graph routing)
docker run -t -v "${PWD}:/data" osrm/osrm-backend osrm-extract -p /opt/car.lua /data/vietnam-latest.osm.pbf
docker run -t -v "${PWD}:/data" osrm/osrm-backend osrm-partition /data/vietnam-latest.osrm
docker run -t -v "${PWD}:/data" osrm/osrm-backend osrm-customize /data/vietnam-latest.osrm

# 3. Run OSRM server (thêm vào docker-compose.yml)
docker run -t -p 5000:5000 -v "${PWD}:/data" osrm/osrm-backend \
  osrm-routed --algorithm mld /data/vietnam-latest.osrm
```

`docker-compose.yml` entry:
```yaml
osrm:
  image: osrm/osrm-backend
  ports: ['5000:5000']
  volumes:
    - ./osrm-data:/data
  command: osrm-routed --algorithm mld /data/vietnam-latest.osrm
```

---

## Checklist
- [ ] `OSRM_URL` có trong `.env.example` và `env.config.ts`
- [ ] Request có timeout (`AbortSignal.timeout`)
- [ ] Response được validate bằng Zod
- [ ] Lỗi được log và throw rõ ràng (không nuốt lỗi)
- [ ] Dữ liệu map VN đã được pre-process trước khi chạy container

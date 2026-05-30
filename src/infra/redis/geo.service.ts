import { redis } from './redis-client';

// Key pattern: shipper:locations (Redis Sorted Set — Geo)
const GEO_KEY = 'shipper:locations';

// Key pattern: shipper:busy (Redis Set)
const BUSY_KEY = 'shipper:busy';

export async function addShipperLocation(
  shipperId: string,
  lng: number,
  lat: number,
): Promise<void> {
  await redis.geoadd(GEO_KEY, lng, lat, shipperId);
}

export async function removeShipperLocation(shipperId: string): Promise<void> {
  await redis.zrem(GEO_KEY, shipperId);
}

export async function findNearby(
  lng: number,
  lat: number,
  radiusKm: number,
  limit = 5,
) {
  return redis.geosearch(
    GEO_KEY,
    'FROMLONLAT',
    lng,
    lat,
    'BYRADIUS',
    radiusKm,
    'km',
    'ASC',
    'COUNT',
    limit,
    'WITHDIST',
  );
}

export async function getDistance(
  member1: string,
  member2: string,
): Promise<number | null> {
  const dist = await (redis.geodist as (key: string, m1: string, m2: string, unit: string) => Promise<string | null>)(GEO_KEY, member1, member2, 'm');
  return dist ? parseFloat(dist) : null;
}

export async function markShipperBusy(shipperId: string): Promise<void> {
  await redis.sadd(BUSY_KEY, shipperId);
}

export async function markShipperFree(shipperId: string): Promise<void> {
  await redis.srem(BUSY_KEY, shipperId);
}

export async function isShipperBusy(shipperId: string): Promise<boolean> {
  return (await redis.sismember(BUSY_KEY, shipperId)) === 1;
}

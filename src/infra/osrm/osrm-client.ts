import { z } from 'zod';
import { env } from '@config/env.config';
import logger from '@shared/logger/logger';

const OsrmRouteResponseSchema = z.object({
  code: z.literal('Ok'),
  routes: z.array(
    z.object({
      distance: z.number(), // meters
      duration: z.number(), // seconds
      geometry: z.object({
        type: z.literal('LineString'),
        coordinates: z.array(z.tuple([z.number(), z.number()])),
      }),
    }),
  ),
});

export type RouteResult = {
  distanceMeters: number;
  durationSeconds: number;
  coordinates: [number, number][]; // [lng, lat][]
};

/**
 * Call OSRM HTTP API to compute real driving distance, duration, and route geometry.
 */
export async function getRoute(
  from: { lng: number; lat: number },
  to: { lng: number; lat: number },
): Promise<RouteResult> {
  const url =
    `${env.OSRM_URL}/route/v1/driving/` +
    `${from.lng},${from.lat};${to.lng},${to.lat}` +
    `?geometries=geojson&overview=full&steps=true`;

  try {
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
  } catch (err: any) {
    logger.error({ err, url }, 'Failed to compute route from OSRM');
    throw err;
  }
}

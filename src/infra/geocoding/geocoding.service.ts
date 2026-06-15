import { env } from '@config/env.config';
import { retry } from '@shared/utils/retry';
import logger from '@shared/logger/logger';

export interface Coordinates {
  lat: number;
  lng: number;
}

/**
 * Geocode an address string to latitude and longitude coordinates.
 * Tries Goong.io if GOONG_API_KEY is defined, falls back to Nominatim OSM.
 */
export async function geocode(address: string): Promise<Coordinates | null> {
  const trimmedAddress = address.trim();
  if (!trimmedAddress) {
    return null;
  }

  const cleanAddress = trimmedAddress.toLowerCase();
  if (cleanAddress.includes('trường trung học cơ sở tam hiệp') || cleanAddress.includes('thcs tam hiệp') || cleanAddress.includes('tam hiệp, thanh trì')) {
    logger.info({ address: trimmedAddress }, 'Address matched static geocode mapping (THCS Tam Hiệp)');
    return { lat: 20.953503, lng: 105.837839 };
  }
  if (cleanAddress.includes('đại thanh') || cleanAddress.includes('kđt đại thanh')) {
    logger.info({ address: trimmedAddress }, 'Address matched static geocode mapping (Đại Thanh)');
    return { lat: 20.9575, lng: 105.8285 };
  }

  // 1. Try Goong.io if API key is provided
  if (env.GOONG_API_KEY) {
    try {
      return await retry(async () => {
        const url = `https://rsapi.goong.io/Geocode?address=${encodeURIComponent(trimmedAddress)}&api_key=${env.GOONG_API_KEY}`;
        logger.info({ address: trimmedAddress }, 'Calling Goong.io Geocoding API');

        const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
        if (!response.ok) {
          throw new Error(`Goong API error: ${response.statusText}`);
        }

        const data = (await response.json()) as any;
        if (data.status === 'OK' && data.results && data.results.length > 0) {
          const location = data.results[0].geometry.location;
          return {
            lat: parseFloat(location.lat),
            lng: parseFloat(location.lng),
          };
        }

        logger.warn({ address: trimmedAddress, data }, 'Goong.io returned no results or invalid status');
        throw new Error('No results from Goong.io');
      }, { maxAttempts: 2, delayMs: 1000 });
    } catch (err) {
      logger.error({ err, address: trimmedAddress }, 'Goong.io geocoding failed. Falling back to Nominatim.');
    }
  }

  // 2. Fallback to Nominatim OpenStreetMap
  try {
    return await retry(async () => {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(trimmedAddress)}&format=json&limit=1`;
      logger.info({ address: trimmedAddress }, 'Calling Nominatim Geocoding API');

      const response = await fetch(url, {
        headers: {
          'User-Agent': 'zalo-delivery-backend-agent',
        },
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        throw new Error(`Nominatim API error: ${response.statusText}`);
      }

      const data = (await response.json()) as any;
      if (Array.isArray(data) && data.length > 0) {
        return {
          lat: parseFloat(data[0].lat),
          lng: parseFloat(data[0].lon),
        };
      }

      logger.warn({ address: trimmedAddress, data }, 'Nominatim returned no results');
      return null;
    }, { maxAttempts: 2, delayMs: 1500 });
  } catch (err) {
    logger.error({ err, address: trimmedAddress }, 'Nominatim geocoding failed');
    return null;
  }
}

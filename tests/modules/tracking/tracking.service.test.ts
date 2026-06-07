import { describe, it, expect } from 'vitest';
import { getHaversineDistance } from '@modules/tracking/tracking.service';

describe('Tracking Haversine Distance (Task 6.2)', () => {
  it('should calculate the correct distance between two points in District 1', () => {
    const lat1 = 10.775;
    const lon1 = 106.695;
    
    // A point nearby (approx 15.6 meters away)
    const lat2 = 10.7751;
    const lon2 = 106.6951;

    const distance = getHaversineDistance(lat1, lon1, lat2, lon2);
    expect(distance).toBeGreaterThan(14);
    expect(distance).toBeLessThan(17);
  });

  it('should return 0 for the exact same point', () => {
    const lat = 10.775;
    const lon = 106.695;
    const distance = getHaversineDistance(lat, lon, lat, lon);
    expect(distance).toBe(0);
  });
});

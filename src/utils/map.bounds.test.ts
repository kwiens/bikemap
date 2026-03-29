import { describe, it, expect } from 'vitest';
import { flyToBounds } from './map';
import { mockMap, mockBounds } from '@/test/fixtures';

describe('flyToBounds', () => {
  it('calls map.fitBounds with padding and animation', () => {
    const map = mockMap();
    const bounds = mockBounds();

    flyToBounds(map, bounds);

    expect(map.fitBounds).toHaveBeenCalledWith(bounds, {
      padding: 60,
      duration: 1000,
      essential: true,
    });
  });

  it('passes bounds directly for any size', () => {
    const map = mockMap();
    const largeBounds = mockBounds({
      getWest: () => -86.0,
      getEast: () => -84.0,
      getNorth: () => 36.0,
      getSouth: () => 34.0,
    });

    flyToBounds(map, largeBounds);

    expect(map.fitBounds).toHaveBeenCalledWith(largeBounds, {
      padding: 60,
      duration: 1000,
      essential: true,
    });
  });
});

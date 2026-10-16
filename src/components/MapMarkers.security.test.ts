/** @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { gbfsToBikeRentalLocation, type GBFSStation } from '@/data/gbfs';
import { createBikeRentalMarker } from './MapMarkers';

const popup = vi.hoisted(() => ({ html: '' }));

vi.mock('mapbox-gl', () => ({
  default: {
    Marker: class {
      setLngLat() {
        return this;
      }
      setPopup() {
        return this;
      }
    },
    Popup: class {
      setHTML(html: string) {
        popup.html = html;
        return this;
      }
    },
  },
}));

const station: GBFSStation = {
  capacity: 10,
  lat: 35.0456,
  lon: -85.3097,
  name: 'Test station',
  rental_methods: [],
  station_id: '1',
};

beforeEach(() => {
  popup.html = '';
});

describe('bike rental popup availability', () => {
  it.each(['num_bikes_available', 'num_docks_available'])(
    'does not interpret %s from external JSON as HTML',
    (field) => {
      const status = JSON.parse(
        JSON.stringify({
          [field]: '<img src="x" onerror="alert(document.domain)">',
          station_id: '1',
        }),
      );
      const location = gbfsToBikeRentalLocation(station, status);
      createBikeRentalMarker(location);

      const root = document.createElement('div');
      root.innerHTML = popup.html;
      expect(root.querySelector('img, [onerror]')).toBeNull();
      expect(location.availableBikes).toBeUndefined();
      expect(location.availableDocks).toBeUndefined();
    },
  );

  it('escapes count values at the HTML sink even if a caller skips GBFS validation', () => {
    const location = gbfsToBikeRentalLocation(station);
    location.availableBikes = '<svg onload="alert(1)">' as unknown as number;
    location.availableDocks =
      '<img src="x" onerror="alert(1)">' as unknown as number;
    createBikeRentalMarker(location);

    const root = document.createElement('div');
    root.innerHTML = popup.html;
    expect(root.querySelector('svg, img, [onload], [onerror]')).toBeNull();
  });

  it('preserves zero and positive whole counts', () => {
    const location = gbfsToBikeRentalLocation(
      station,
      JSON.parse('{"num_bikes_available":0,"num_docks_available":7}'),
    );
    createBikeRentalMarker(location);

    expect(popup.html).toContain('Available Bikes:</strong> 0');
    expect(popup.html).toContain('Available Docks:</strong> 7');
  });

  it.each(
    [-1, 1.5, Infinity, NaN, '7', null, {}, []].map((value) => ({ value })),
  )('rejects an invalid availability count: $value', ({ value }) => {
    const status = {
      num_bikes_available: value,
      num_docks_available: value,
    } as unknown as Parameters<typeof gbfsToBikeRentalLocation>[1];
    const location = gbfsToBikeRentalLocation(station, status);
    expect(location.availableBikes).toBeUndefined();
    expect(location.availableDocks).toBeUndefined();
  });
});

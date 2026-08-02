import { describe, expect, it } from 'vitest';
import { bendData } from './index';

describe('Bend curated trail source', () => {
  it('renders the generated profile-aligned GeoJSON', () => {
    expect(bendData.mountainBike.layers).toEqual([
      expect.objectContaining({
        sourceId: 'bend-mtb-trails-source',
        geojsonUrl: '/data/bend/trails.geojson',
        trailProp: 'Trail',
        matchBy: 'name',
      }),
    ]);
  });
});

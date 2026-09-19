import { describe, expect, it } from 'vitest';
import { bendData } from './index';

describe('Bend curated trail source', () => {
  it('renders curated geometry from the Payload-backed API', () => {
    expect(bendData.mountainBike.layers).toEqual([
      expect.objectContaining({
        sourceId: 'bend-mtb-trails-source',
        geojsonUrl: '/api/map/trails?city=bend',
        trailProp: 'Trail',
        matchBy: 'name',
      }),
    ]);
  });
});

import { describe, expect, it } from 'vitest';
import { chattanoogaData } from './index';

describe('Chattanooga curated trail source', () => {
  it('renders regional geometry from the Payload-backed API', () => {
    expect(chattanoogaData.mountainBike.layers[0]).toEqual(
      expect.objectContaining({
        sourceId: 'mtb-trails-source',
        geojsonUrl: '/api/map/trails?city=chattanooga',
        geojsonFallbackUrl: '/data/chattanooga/trails.geojson',
        trailProp: 'Trail',
        matchBy: 'name',
      }),
    );
  });
});

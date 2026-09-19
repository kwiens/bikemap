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

  it('renders curated routes from repository-owned GeoJSON', () => {
    expect(chattanoogaData.bikeRoutesUrl).toBe(
      '/data/chattanooga/routes.geojson',
    );
    expect(chattanoogaData.inlineBikeRouteIds).toEqual([
      'riverwalk-loop-v3-public',
    ]);
  });
});

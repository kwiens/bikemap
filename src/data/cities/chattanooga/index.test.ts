import { describe, expect, it } from 'vitest';
import { hiddenStyleLayerIdsFor } from '@/data/mapbox-style';
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

  it('uses Payload as the only curated route geometry source', () => {
    expect(chattanoogaData.bikeRoutesUrl).toBe(
      '/api/map/routes?city=chattanooga',
    );
    expect(chattanoogaData.inlineBikeRouteIds).toBeUndefined();
    expect(hiddenStyleLayerIdsFor(chattanoogaData)).toContain(
      'riverwalk-loop-v3-public',
    );
    expect(hiddenStyleLayerIdsFor(chattanoogaData)).toContain(
      'zoo-loop-v2-full-public',
    );
  });
});

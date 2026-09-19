import { describe, expect, it } from 'vitest';
import {
  hiddenStyleLayerIdsFor,
  inactiveStyleRouteLayerIds,
} from '@/data/mapbox-style';
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

  it('configures Payload route data without globally hiding owned Studio layers', () => {
    expect(chattanoogaData.bikeRoutesUrl).toBe(
      '/api/map/routes?city=chattanooga',
    );
    expect(chattanoogaData.inlineBikeRouteIds).toEqual([
      'riverwalk-loop-v3-public',
    ]);
    expect(hiddenStyleLayerIdsFor(chattanoogaData)).not.toContain(
      'riverwalk-loop-v3-public',
    );
    expect(hiddenStyleLayerIdsFor(chattanoogaData)).not.toContain(
      'zoo-loop-v2-full-public',
    );
  });

  it('only leaves explicitly published Studio routes visible', () => {
    expect(
      inactiveStyleRouteLayerIds(
        [
          {
            ...chattanoogaData.bikeRoutes[1],
            geometrySource: 'studio',
          },
        ],
        ['riverwalk-loop-v3-public'],
      ),
    ).toEqual(
      expect.arrayContaining([
        'riverwalk-loop-v3-public',
        'Riverwalk_trail-test-public',
      ]),
    );
    expect(
      inactiveStyleRouteLayerIds(
        [
          {
            ...chattanoogaData.bikeRoutes[1],
            geometrySource: 'studio',
          },
        ],
        ['riverwalk-loop-v3-public'],
      ),
    ).not.toContain('zoo-loop-v2-full-public');
  });
});

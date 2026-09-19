import { afterEach, describe, expect, it, vi } from 'vitest';
import type mapboxgl from 'mapbox-gl';
import type { BikeRoute } from '@/data/geo_data';
import { loadRouteFeatures } from './route-export';

const routes = [{ id: 'inline-route' }, { id: 'studio-route' }] as BikeRoute[];

describe('loadRouteFeatures', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('combines a partial inline file with remaining Studio routes', async () => {
    const inlineFeature = {
      type: 'Feature',
      properties: { id: 'inline-route' },
      geometry: {
        type: 'LineString',
        coordinates: [
          [0, 0],
          [1, 1],
        ],
      },
    } as GeoJSON.Feature;
    const studioFeature = {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: [
          [2, 2],
          [3, 3],
        ],
      },
    } as GeoJSON.Feature;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          type: 'FeatureCollection',
          features: [inlineFeature],
        }),
      }),
    );
    const map = {
      getStyle: vi.fn().mockReturnValue({
        layers: [
          {
            id: 'studio-route',
            type: 'line',
            source: 'composite',
            'source-layer': 'studio-routes',
          },
        ],
      }),
      querySourceFeatures: vi.fn().mockReturnValue([studioFeature]),
    } as unknown as mapboxgl.Map;

    await expect(
      loadRouteFeatures(map, routes, {
        bikeRoutesUrl: '/data/routes.geojson',
        inlineBikeRouteIds: ['inline-route'],
      }),
    ).resolves.toEqual([
      { routeId: 'inline-route', features: [inlineFeature] },
      { routeId: 'studio-route', features: [studioFeature] },
    ]);
    expect(map.querySourceFeatures).toHaveBeenCalledWith('composite', {
      sourceLayer: 'studio-routes',
    });
  });

  it('treats the inline file as complete when no subset is configured', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ type: 'FeatureCollection', features: [] }),
      }),
    );
    const map = {
      getStyle: vi.fn().mockReturnValue({ layers: [] }),
      querySourceFeatures: vi.fn(),
    } as unknown as mapboxgl.Map;

    await expect(
      loadRouteFeatures(map, routes, {
        bikeRoutesUrl: '/data/routes.geojson',
      }),
    ).resolves.toEqual([]);
    expect(map.querySourceFeatures).not.toHaveBeenCalled();
  });
});

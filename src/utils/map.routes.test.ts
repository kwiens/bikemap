import { describe, it, expect, vi } from 'vitest';
import {
  updateRouteOpacity,
  calculateRouteBounds,
  findLocationInArray,
} from './map';
import { mockMap, mockBikeRoute } from '@/test/fixtures';
import type mapboxgl from 'mapbox-gl';

describe('updateRouteOpacity', () => {
  it('sets selected/unselected opacity on matching routes', () => {
    const map = mockMap({ getLayer: vi.fn().mockReturnValue(undefined) });
    const routes = [
      mockBikeRoute({ id: 'route1' }),
      mockBikeRoute({ id: 'route2' }),
      mockBikeRoute({ id: 'route3' }),
    ];

    updateRouteOpacity(map, routes, 'route2', {
      selected: 0.8,
      unselected: 0.2,
    });

    expect(map.setPaintProperty).toHaveBeenCalledWith(
      'route1',
      'line-opacity',
      0.2,
    );
    expect(map.setPaintProperty).toHaveBeenCalledWith(
      'route2',
      'line-opacity',
      0.8,
    );
    expect(map.setPaintProperty).toHaveBeenCalledWith(
      'route3',
      'line-opacity',
      0.2,
    );
  });

  it('sets all routes to unselected when selectedId is null', () => {
    const map = mockMap({ getLayer: vi.fn().mockReturnValue(undefined) });
    const routes = [
      mockBikeRoute({ id: 'route1' }),
      mockBikeRoute({ id: 'route2' }),
    ];

    updateRouteOpacity(map, routes, null, { selected: 0.8, unselected: 0.1 });

    expect(map.setPaintProperty).toHaveBeenCalledWith(
      'route1',
      'line-opacity',
      0.1,
    );
    expect(map.setPaintProperty).toHaveBeenCalledWith(
      'route2',
      'line-opacity',
      0.1,
    );
  });

  it('handles errors when setting paint property', () => {
    const map = mockMap({
      setPaintProperty: vi.fn().mockImplementation(() => {
        throw new Error('Layer not found');
      }),
    });
    const routes = [mockBikeRoute({ id: 'bad-route' })];

    expect(() => {
      updateRouteOpacity(map, routes, 'bad-route', {
        selected: 0.8,
        unselected: 0.2,
      });
    }).not.toThrow();
  });
});

describe('calculateRouteBounds', () => {
  it('calculates bounds for LineString features', () => {
    const map = mockMap({
      querySourceFeatures: vi.fn().mockReturnValue([
        {
          geometry: {
            type: 'LineString',
            coordinates: [
              [-85.3, 35.0],
              [-85.31, 35.01],
              [-85.32, 35.02],
            ],
          },
        },
      ]),
    });

    const route = mockBikeRoute({ id: 'test-route' });
    const layer = {
      id: 'test-route',
      type: 'line',
      source: 'test-source',
      'source-layer': 'test-layer',
    } as mapboxgl.AnyLayer;

    const bounds = calculateRouteBounds(map, route, layer);

    expect(bounds).not.toBeNull();
    expect(map.querySourceFeatures).toHaveBeenCalledWith('test-source', {
      sourceLayer: 'test-layer',
    });
  });

  it('handles MultiLineString features', () => {
    const map = mockMap({
      querySourceFeatures: vi.fn().mockReturnValue([
        {
          geometry: {
            type: 'MultiLineString',
            coordinates: [
              [
                [-85.3, 35.0],
                [-85.31, 35.01],
              ],
              [
                [-85.32, 35.02],
                [-85.33, 35.03],
              ],
            ],
          },
        },
      ]),
    });

    const route = mockBikeRoute();
    const layer = {
      id: 'test',
      type: 'line',
      source: 'src',
      'source-layer': 'sl',
    } as mapboxgl.AnyLayer;

    const bounds = calculateRouteBounds(map, route, layer);
    expect(bounds).not.toBeNull();
  });

  it('returns null when source has no features', () => {
    const map = mockMap({
      querySourceFeatures: vi.fn().mockReturnValue([]),
    });

    const route = mockBikeRoute();
    const layer = {
      id: 'test',
      type: 'line',
      source: 'src',
      'source-layer': 'sl',
    } as mapboxgl.AnyLayer;

    expect(calculateRouteBounds(map, route, layer)).toBeNull();
  });

  it('returns null for missing source layer', () => {
    const map = mockMap({
      querySourceFeatures: vi.fn().mockReturnValue([]),
    });

    const route = mockBikeRoute();
    const layer = {
      id: 'test',
      type: 'line',
      source: 'src',
    } as mapboxgl.AnyLayer;

    expect(calculateRouteBounds(map, route, layer)).toBeNull();
  });
});

describe('findLocationInArray', () => {
  it('finds location by exact coordinates', () => {
    const locations = [
      { name: 'A', latitude: 35.04, longitude: -85.3 },
      { name: 'B', latitude: 35.05, longitude: -85.31 },
    ];
    expect(findLocationInArray(locations, [-85.31, 35.05])).toEqual(
      locations[1],
    );
  });

  it('returns undefined when not found', () => {
    const locations = [{ name: 'A', latitude: 35.04, longitude: -85.3 }];
    expect(findLocationInArray(locations, [-85.99, 35.99])).toBeUndefined();
  });

  it('returns undefined for empty array', () => {
    expect(findLocationInArray([], [-85.3, 35.0])).toBeUndefined();
  });

  it('matches exact floating point coordinates', () => {
    const locations = [
      { name: 'Precise', latitude: 35.123456789, longitude: -85.987654321 },
    ];
    expect(
      findLocationInArray(locations, [-85.987654321, 35.123456789]),
    ).toEqual(locations[0]);
  });
});

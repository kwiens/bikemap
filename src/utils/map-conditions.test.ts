/** @vitest-environment jsdom */

import { describe, expect, it, vi } from 'vitest';
import type mapboxgl from 'mapbox-gl';
import type { MountainBikeTrail } from '@/data/mountain-bike-trails';
import { setClosedTrails } from './map';

vi.mock('@/data/geo_data', () => ({
  mountainBikeConfig: {
    layers: [
      { layerId: 'imported', trailProp: 'Trail', matchBy: 'name' },
      { layerId: 'osm', trailProp: 'OSM_ID', matchBy: 'osmId' },
    ],
  },
  trailMetadata: {},
}));
vi.mock('@/data/trail-source', () => ({
  getMountainBikeTrails: () => [],
  onMountainBikeTrailsChange: vi.fn(),
}));

describe('trail closure overlays', () => {
  function setup(layer: mapboxgl.LineLayerSpecification) {
    const layers = new Map<string, mapboxgl.LayerSpecification>([
      [layer.id, layer],
      ['labels', { id: 'labels', type: 'symbol', source: 'base' }],
    ]);
    const map = {
      getLayer: (id: string) => layers.get(id),
      getStyle: () => ({ layers: [...layers.values()] }),
      addLayer: vi.fn((value: mapboxgl.LayerSpecification) =>
        layers.set(value.id, value),
      ),
      setFilter: vi.fn(),
      removeLayer: vi.fn((id: string) => layers.delete(id)),
    };
    return { map, instance: map as unknown as mapboxgl.Map };
  }

  it('uses the imported GeoJSON source and existing filter without a hit layer', () => {
    const filter: mapboxgl.FilterSpecification = [
      'in',
      ['get', 'Trail'],
      ['literal', ['Bear Creek']],
    ];
    const { map, instance } = setup({
      id: 'imported',
      type: 'line',
      source: 'cms-trails',
      filter,
      minzoom: 8,
    });
    const trail = { trailName: 'Bear Creek' } as MountainBikeTrail;
    setClosedTrails(instance, [trail]);
    expect(map.addLayer).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        id: 'imported Closed',
        source: 'cms-trails',
        minzoom: 8,
        filter: [
          'all',
          filter,
          ['in', ['get', 'Trail'], ['literal', ['Bear Creek']]],
        ],
      }),
      'labels',
    );
    expect(map.addLayer.mock.calls[0][0]).not.toHaveProperty('source-layer');

    setClosedTrails(instance, [trail]);
    expect(map.addLayer).toHaveBeenCalledTimes(1);
    setClosedTrails(instance, []);
    expect(map.removeLayer).toHaveBeenCalledWith('imported Closed');
  });

  it('uses OSM way ids and the actual vector source-layer for Bend', () => {
    const { map, instance } = setup({
      id: 'osm',
      type: 'line',
      source: 'trails-vector',
      'source-layer': 'trail',
    });
    setClosedTrails(instance, [
      { trailName: 'Tiddlywinks', osmIds: [42, 43] } as MountainBikeTrail,
    ]);
    expect(map.addLayer).toHaveBeenCalledWith(
      expect.objectContaining({
        'source-layer': 'trail',
        filter: [
          'in',
          ['to-string', ['get', 'OSM_ID']],
          ['literal', ['42', '43']],
        ],
      }),
      'labels',
    );
  });

  it('adds no rendering layers when no trails are closed', () => {
    const { map, instance } = setup({
      id: 'imported',
      type: 'line',
      source: 'cms-trails',
    });
    setClosedTrails(instance, []);
    expect(map.addLayer).not.toHaveBeenCalled();
  });
});

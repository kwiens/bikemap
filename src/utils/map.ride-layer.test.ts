import { describe, it, expect, vi } from 'vitest';
import { addRideLayer, updateRideLayer, removeRideLayer } from './map';
import { mockMap } from '@/test/fixtures';

describe('addRideLayer', () => {
  it('adds source and layer with correct GeoJSON', () => {
    const map = mockMap({
      getLayer: vi.fn().mockReturnValue(undefined),
      getSource: vi.fn().mockReturnValue(undefined),
    });
    const coords: [number, number][] = [
      [-85.3, 35.0],
      [-85.31, 35.01],
    ];

    addRideLayer(map, coords);

    expect(map.addSource).toHaveBeenCalledWith(
      'recorded-ride',
      expect.objectContaining({
        type: 'geojson',
        data: expect.objectContaining({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: coords },
        }),
      }),
    );
    expect(map.addLayer).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'recorded-ride-line',
        type: 'line',
        source: 'recorded-ride',
      }),
    );
  });

  it('removes existing layer before adding', () => {
    const map = mockMap();

    addRideLayer(map, [
      [-85.3, 35.0],
      [-85.31, 35.01],
    ]);

    // removeRideLayer is called first, which checks getLayer/getSource
    expect(map.removeLayer).toHaveBeenCalled();
  });
});

describe('updateRideLayer', () => {
  it('updates existing source data', () => {
    const setData = vi.fn();
    const map = mockMap({
      getSource: vi.fn().mockReturnValue({ setData }),
    });
    const coords: [number, number][] = [
      [-85.3, 35.0],
      [-85.31, 35.01],
    ];

    updateRideLayer(map, coords);

    expect(setData).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: coords },
      }),
    );
  });

  it('falls back to addRideLayer when source does not exist', () => {
    const map = mockMap({
      getSource: vi.fn().mockReturnValue(undefined),
      getLayer: vi.fn().mockReturnValue(undefined),
    });

    updateRideLayer(map, [
      [-85.3, 35.0],
      [-85.31, 35.01],
    ]);

    expect(map.addSource).toHaveBeenCalled();
    expect(map.addLayer).toHaveBeenCalled();
  });
});

describe('removeRideLayer', () => {
  it('removes layer then source when they exist', () => {
    const map = mockMap({
      getLayer: vi.fn().mockReturnValue({ id: 'recorded-ride-line' }),
      getSource: vi.fn().mockReturnValue({ type: 'geojson' }),
    });

    removeRideLayer(map);

    expect(map.removeLayer).toHaveBeenCalledWith('recorded-ride-line');
    expect(map.removeSource).toHaveBeenCalledWith('recorded-ride');
  });

  it('no-ops when layer does not exist', () => {
    const map = mockMap({
      getLayer: vi.fn().mockReturnValue(undefined),
      getSource: vi.fn().mockReturnValue(undefined),
    });

    removeRideLayer(map);

    expect(map.removeLayer).not.toHaveBeenCalled();
    expect(map.removeSource).not.toHaveBeenCalled();
  });
});

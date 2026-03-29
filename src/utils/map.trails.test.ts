import { describe, it, expect, vi } from 'vitest';
import {
  updateMtnBikeOpacity,
  highlightMtnBikeArea,
  initMtnBikeColors,
  TRAIL_LAYERS,
} from './map';
import { TRAIL_METADATA, RATING_COLORS } from '@/data/trail-metadata';
import { mockMap, mockMountainBikeTrail } from '@/test/fixtures';

describe('updateMtnBikeOpacity', () => {
  it('sets conditional expressions when a trail is selected', () => {
    const map = mockMap();

    updateMtnBikeOpacity(map, 'Five Points');

    expect(map.setPaintProperty).toHaveBeenCalledWith(
      'SORBA Regional Trails',
      'line-opacity',
      expect.arrayContaining(['case']),
    );
    expect(map.setPaintProperty).toHaveBeenCalledWith(
      'SORBA Regional Trails',
      'line-width',
      expect.arrayContaining(['case']),
    );
  });

  it('resets to default opacity and width when selectedTrailName is null', () => {
    const map = mockMap();

    updateMtnBikeOpacity(map, null);

    expect(map.setPaintProperty).toHaveBeenCalledWith(
      'SORBA Regional Trails',
      'line-opacity',
      0.15,
    );
    expect(map.setPaintProperty).toHaveBeenCalledWith(
      'SORBA Regional Trails',
      'line-width',
      2,
    );
  });

  it('handles missing casing and glow layers gracefully', () => {
    const mainLayers = new Set([
      'SORBA Regional Trails',
      'Godsey Ridge Trails',
    ]);
    const map = mockMap({
      getLayer: vi.fn((id: string) =>
        mainLayers.has(id) ? { id } : undefined,
      ),
    });

    expect(() => updateMtnBikeOpacity(map, 'Five Points')).not.toThrow();
    expect(map.setPaintProperty).toHaveBeenCalledTimes(4);
  });

  it('updates casing and glow layers when they exist and trail is selected', () => {
    const map = mockMap();

    updateMtnBikeOpacity(map, 'Five Points');

    expect(map.setPaintProperty).toHaveBeenCalledWith(
      'SORBA Regional Trails Casing',
      'line-opacity',
      expect.anything(),
    );
    expect(map.setPaintProperty).toHaveBeenCalledWith(
      'SORBA Regional Trails Glow',
      'line-opacity',
      expect.anything(),
    );
  });
});

describe('updateMtnBikeOpacity with Godsey Ridge trail', () => {
  it('reverse-maps display name to raw feature value for metadata layers', () => {
    const allLayers = new Set([
      'SORBA Regional Trails',
      'Godsey Ridge Trails',
      'SORBA Regional Trails Casing',
      'SORBA Regional Trails Glow',
      'Godsey Ridge Trails Casing',
      'Godsey Ridge Trails Glow',
    ]);
    const map = mockMap({
      getLayer: vi.fn((id: string) => (allLayers.has(id) ? { id } : undefined)),
    });

    updateMtnBikeOpacity(map, 'Godsey Ridge Green');

    expect(map.setPaintProperty).toHaveBeenCalledWith(
      'Godsey Ridge Trails',
      'line-opacity',
      ['case', ['==', ['get', 'Name'], 'Green as built'], 0.9, 0.15],
    );
  });
});

describe('highlightMtnBikeArea', () => {
  it('highlights trails matching by recArea', () => {
    const map = mockMap();
    const trails = [
      mockMountainBikeTrail({
        trailName: 'Trail A',
        recArea: 'Raccoon Mountain',
      }),
      mockMountainBikeTrail({
        trailName: 'Trail B',
        recArea: 'Raccoon Mountain',
      }),
      mockMountainBikeTrail({
        trailName: 'Trail C',
        recArea: 'Stringers Ridge',
      }),
    ];

    highlightMtnBikeArea(map, trails, 'Raccoon Mountain');

    expect(map.setPaintProperty).toHaveBeenCalledWith(
      'SORBA Regional Trails',
      'line-opacity',
      ['match', ['get', 'Trail'], ['Trail A', 'Trail B'], 0.9, 0.1],
    );
  });

  it('does nothing when no trails match', () => {
    const map = mockMap();
    const trails = [
      mockMountainBikeTrail({
        trailName: 'Trail A',
        recArea: 'Raccoon Mountain',
      }),
    ];

    highlightMtnBikeArea(map, trails, 'Nonexistent Area');

    expect(map.setPaintProperty).not.toHaveBeenCalled();
  });
});

describe('TRAIL_LAYERS', () => {
  it('has entries for both SORBA and Godsey Ridge layers', () => {
    expect(TRAIL_LAYERS.length).toBeGreaterThanOrEqual(2);
    expect(
      TRAIL_LAYERS.find((l) => l.layerId === 'SORBA Regional Trails'),
    ).toBeDefined();
    expect(
      TRAIL_LAYERS.find((l) => l.layerId === 'Godsey Ridge Trails'),
    ).toBeDefined();
  });

  it('SORBA layer uses rating property directly', () => {
    const sorba = TRAIL_LAYERS.find(
      (l) => l.layerId === 'SORBA Regional Trails',
    );
    expect(sorba?.hasRatingProp).toBe(true);
    expect(sorba?.trailProp).toBe('Trail');
  });

  it('Godsey layer uses metadata for ratings', () => {
    const godsey = TRAIL_LAYERS.find(
      (l) => l.layerId === 'Godsey Ridge Trails',
    );
    expect(godsey?.hasRatingProp).toBe(false);
    expect(godsey?.trailProp).toBe('Name');
  });
});

describe('TRAIL_METADATA', () => {
  it('has entries for all Godsey Ridge trails', () => {
    const godseyNames = [
      'Green as built',
      'Blue as built 1',
      'Blue as built 2',
      'Exper_Spur_As_built_21626',
      'Expert_As_Built_1',
      'Expert_As_Built_2',
    ];
    for (const name of godseyNames) {
      expect(TRAIL_METADATA[name]).toBeDefined();
      expect(TRAIL_METADATA[name].displayName).toContain('Godsey Ridge');
    }
  });

  it('all ratings have corresponding colors', () => {
    for (const meta of Object.values(TRAIL_METADATA)) {
      if (meta.rating) {
        expect(RATING_COLORS[meta.rating]).toBeDefined();
      }
    }
  });
});

describe('initMtnBikeColors', () => {
  it('sets line-color on all existing trail layers', () => {
    const map = mockMap();

    initMtnBikeColors(map);

    for (const cfg of TRAIL_LAYERS) {
      expect(map.setPaintProperty).toHaveBeenCalledWith(
        cfg.layerId,
        'line-color',
        expect.anything(),
      );
    }
  });

  it('skips layers that do not exist', () => {
    const map = mockMap({ getLayer: vi.fn().mockReturnValue(undefined) });

    initMtnBikeColors(map);

    expect(map.setPaintProperty).not.toHaveBeenCalled();
  });
});

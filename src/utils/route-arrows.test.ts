import { describe, expect, it } from 'vitest';
import type * as GeoJSON from 'geojson';
import {
  applyArrowDirectionOverrides,
  removeOverlappingSegments,
  spaceRouteArrows,
} from './route-arrows';

describe('spaceRouteArrows', () => {
  const path = [
    [-100, 0],
    [100, 0],
  ];

  it('keeps the same spacing as a line scales across the viewport', () => {
    for (const scale of [2, 4, 8, 16]) {
      const arrows = spaceRouteArrows(
        [path],
        ([x, y]) => ({ x: 160 + x * scale, y: 100 + y * scale }),
        320,
        200,
      );

      expect(arrows.map(({ y, angle }) => [y, angle])).toEqual([
        [100, 0],
        [100, 0],
      ]);
      expect(arrows[0].x).toBeCloseTo(80);
      expect(arrows[1].x).toBeCloseTo(240);
    }
  });

  it('skips arrows where nearby sections of a route double back', () => {
    const arrows = spaceRouteArrows(
      [
        path,
        [
          [100, 15],
          [-100, 15],
        ],
      ],
      ([x, y]) => ({ x: 160 + x * 2, y: 100 + y * 2 }),
      320,
      200,
    );

    expect(arrows.map(({ x, y }) => [x, y])).toEqual([
      [80, 100],
      [240, 100],
    ]);
  });

  it('points along a short visible run even when both vertices are off screen', () => {
    const arrows = spaceRouteArrows(
      [
        [
          [100, -50],
          [100, 100],
        ],
      ],
      ([x, y]) => ({ x, y }),
      320,
      60,
    );

    expect(arrows).toHaveLength(1);
    expect(arrows[0]).toMatchObject({ x: 100, angle: Math.PI / 2 });
    expect(arrows[0].y).toBeCloseTo(30);
  });
});

describe('removeOverlappingSegments', () => {
  it('should keep non-overlapping segments unchanged', () => {
    const features: GeoJSON.Feature[] = [
      {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: [
            [-85.3, 35.0],
            [-85.31, 35.01],
            [-85.32, 35.02],
          ],
        },
      },
    ];

    const result = removeOverlappingSegments(features);
    expect(result).toHaveLength(1);
    expect(result[0].geometry.coordinates).toHaveLength(3);
  });

  it('should remove shared edges while preserving unique runs', () => {
    const features: GeoJSON.Feature[] = [
      {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: [
            [-85.3, 35.0],
            [-85.31, 35.01],
            [-85.32, 35.02],
            [-85.33, 35.03],
          ],
        },
      },
      {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: [
            [-85.34, 35.04],
            [-85.32, 35.02],
            [-85.31, 35.01],
            [-85.35, 35.05],
          ],
        },
      },
    ];

    const result = removeOverlappingSegments(features);

    expect(result.map((feature) => feature.geometry.coordinates)).toEqual([
      [
        [-85.3, 35.0],
        [-85.31, 35.01],
      ],
      [
        [-85.32, 35.02],
        [-85.33, 35.03],
      ],
      [
        [-85.34, 35.04],
        [-85.32, 35.02],
      ],
      [
        [-85.31, 35.01],
        [-85.35, 35.05],
      ],
    ]);
  });

  it('should keep paths that only cross at one coordinate', () => {
    const features: GeoJSON.Feature[] = [
      {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: [
            [-85.3, 35.0],
            [-85.31, 35.01],
            [-85.32, 35.02],
          ],
        },
      },
      {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: [
            [-85.34, 35.04],
            [-85.31, 35.01],
            [-85.35, 35.05],
          ],
        },
      },
    ];

    const result = removeOverlappingSegments(features);

    expect(result).toHaveLength(2);
    expect(result.map((feature) => feature.geometry.coordinates)).toEqual(
      features.map(
        (feature) => (feature.geometry as GeoJSON.LineString).coordinates,
      ),
    );
  });

  it('should not treat tile fragments of the same feature as overlap', () => {
    const features: GeoJSON.Feature[] = [
      {
        type: 'Feature',
        id: 42,
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: [
            [-85.3, 35.0],
            [-85.31, 35.01],
            [-85.32, 35.02],
          ],
        },
      },
      {
        type: 'Feature',
        id: 42,
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: [
            [-85.31, 35.01],
            [-85.32, 35.02],
            [-85.33, 35.03],
          ],
        },
      },
    ];

    expect(removeOverlappingSegments(features)).toHaveLength(2);
  });

  it('should return empty array for empty input', () => {
    expect(removeOverlappingSegments([])).toHaveLength(0);
  });
});

describe('applyArrowDirectionOverrides', () => {
  it('should reverse only consecutive edges inside configured bounds', () => {
    const features: GeoJSON.Feature<GeoJSON.LineString>[] = [
      {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: [
            [-85.3075, 35.051],
            [-85.3064, 35.051],
            [-85.3064, 35.0497],
            [-85.3058, 35.0497],
          ],
        },
      },
    ];

    const result = applyArrowDirectionOverrides(features, [
      [-85.3076, 35.0509, -85.3063, 35.0511],
      [-85.3065, 35.0496, -85.3063, 35.0511],
    ]);

    expect(result.map((feature) => feature.geometry.coordinates)).toEqual([
      [
        [-85.3064, 35.0497],
        [-85.3064, 35.051],
        [-85.3075, 35.051],
      ],
      [
        [-85.3064, 35.0497],
        [-85.3058, 35.0497],
      ],
    ]);
  });

  it('should leave geometry unchanged without overrides', () => {
    const features: GeoJSON.Feature<GeoJSON.LineString>[] = [
      {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: [
            [-85.3, 35],
            [-85.31, 35.01],
          ],
        },
      },
    ];

    expect(applyArrowDirectionOverrides(features)).toBe(features);
  });
});

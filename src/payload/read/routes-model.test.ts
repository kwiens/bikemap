import { describe, expect, it } from 'vitest';
import { publicBikeRoutes, routeFeatureCollection } from './routes-model';

describe('routeFeatureCollection', () => {
  it('keys stored geometry by its stable public route id', () => {
    const geom = {
      type: 'MultiLineString',
      coordinates: [
        [
          [-85.3, 35],
          [-85.31, 35.01],
        ],
      ],
    };

    expect(
      routeFeatureCollection([
        {
          geom,
          routeId: 'riverwalk-loop-v3-public',
          sourceFeatureCount: 1,
        },
        { geom: null, routeId: 'unfinished-route' },
      ]),
    ).toEqual({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {
            id: 'riverwalk-loop-v3-public',
            sourceFeatureCount: 1,
          },
          geometry: geom,
        },
      ],
    });
  });

  it('uses a linked trail as the route geometry and measurement source', () => {
    const geom = {
      type: 'MultiLineString',
      coordinates: [
        [
          [-121.4, 44],
          [-121.39, 44.01],
        ],
      ],
    };
    const sourceTrails = new Map([
      ['42', { bounds: [-121.4, 44, -121.39, 44.01], distance: 3.2, geom }],
    ]);
    const routes = [
      {
        color: '#059669',
        geometrySource: 'trail' as const,
        kind: 'trail' as const,
        name: 'Deschutes River Trail',
        routeId: 'deschutes-river-trail',
        sourceTrail: 42,
      },
    ];

    expect(
      routeFeatureCollection(routes, sourceTrails).features[0].geometry,
    ).toBe(geom);
    expect(publicBikeRoutes(routes, sourceTrails)[0]).toEqual(
      expect.objectContaining({
        defaultBounds: [-121.4, 44, -121.39, 44.01],
        distance: 3.2,
        id: 'deschutes-river-trail',
        kind: 'trail',
      }),
    );
  });

  it('omits a trail-backed route whose linked trail has no geometry', () => {
    const route = {
      geometrySource: 'trail' as const,
      name: 'Missing trail',
      routeId: 'missing-trail',
      sourceTrail: 99,
    };
    expect(routeFeatureCollection([route]).features).toEqual([]);
    expect(publicBikeRoutes([route])).toEqual([]);
  });
});

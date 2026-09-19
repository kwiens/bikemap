import { describe, expect, it } from 'vitest';
import { routeFeatureCollection } from './routes-model';

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
});

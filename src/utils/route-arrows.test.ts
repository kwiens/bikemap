import { describe, expect, it } from 'vitest';
import { spaceRouteArrows } from './route-arrows';

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

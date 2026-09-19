import { describe, expect, it } from 'vitest';
import { bendBikeRoutes } from './bike-routes.data';

describe('Bend bike routes', () => {
  it('hides direction arrows on unoriented OSM route networks', () => {
    expect(bendBikeRoutes.length).toBeGreaterThan(0);
    expect(bendBikeRoutes.every((route) => route.hideArrows)).toBe(true);
  });
});

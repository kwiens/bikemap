import { describe, expect, it } from 'vitest';
import { validateRouteGeometry } from './Routes';

describe('validateRouteGeometry', () => {
  it('accepts a drawable line', () => {
    expect(
      validateRouteGeometry({
        type: 'MultiLineString',
        coordinates: [
          [
            [-85.3, 35.0],
            [-85.31, 35.01],
          ],
        ],
      }),
    ).toBe(true);
  });

  it('rejects missing and invalid geometry', () => {
    expect(validateRouteGeometry(null)).toBe(
      'Route geometry must contain at least one line.',
    );
    expect(
      validateRouteGeometry({ type: 'Point', coordinates: [-85.3, 35] }),
    ).toContain('MultiLineString or LineString');
  });

  it('allows geometry to come from a linked trail', () => {
    expect(
      validateRouteGeometry(undefined, {
        siblingData: { geometrySource: 'trail' },
      }),
    ).toBe(true);
  });

  it('allows geometry to come from an explicit Studio layer', () => {
    expect(
      validateRouteGeometry(undefined, {
        siblingData: { geometrySource: 'studio' },
      }),
    ).toBe(true);
  });
});

import { describe, it, expect } from 'vitest';
import { buildSvg } from './svg';

function lineStringFeature(
  coords: [number, number][],
): GeoJSON.Feature<GeoJSON.LineString> {
  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'LineString', coordinates: coords },
  };
}

function multiLineStringFeature(
  lines: [number, number][][],
): GeoJSON.Feature<GeoJSON.MultiLineString> {
  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'MultiLineString', coordinates: lines },
  };
}

describe('buildSvg', () => {
  it('returns null for empty features array', () => {
    expect(buildSvg([], '#ff0000')).toBeNull();
  });

  it('returns null for features with no line geometries', () => {
    const point: GeoJSON.Feature = {
      type: 'Feature',
      properties: {},
      geometry: { type: 'Point', coordinates: [-85, 35] },
    };
    expect(buildSvg([point], '#ff0000')).toBeNull();
  });

  it('generates SVG for a single LineString', () => {
    const svg = buildSvg(
      [
        lineStringFeature([
          [-85.3, 35.0],
          [-85.31, 35.01],
          [-85.32, 35.02],
        ]),
      ],
      '#e74c3c',
    );
    expect(svg).not.toBeNull();
    expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('viewBox=');
    expect(svg).toContain('stroke="#e74c3c"');
    expect(svg).toContain('<path d="M');
    expect(svg).toContain('</svg>');
  });

  it('uses the provided color for stroke', () => {
    const svg = buildSvg(
      [
        lineStringFeature([
          [-85.3, 35.0],
          [-85.31, 35.01],
        ]),
      ],
      '#2563EB',
    );
    expect(svg).toContain('stroke="#2563EB"');
  });

  it('generates paths for MultiLineString', () => {
    const svg = buildSvg(
      [
        multiLineStringFeature([
          [
            [-85.3, 35.0],
            [-85.31, 35.01],
          ],
          [
            [-85.32, 35.02],
            [-85.33, 35.03],
          ],
        ]),
      ],
      '#000',
    );
    expect(svg).not.toBeNull();
    // Path d should contain both M commands (one per line segment)
    const mCommands = svg?.match(/M\d/g);
    expect(mCommands?.length).toBeGreaterThanOrEqual(2);
  });

  it('includes viewBox with padding', () => {
    const svg = buildSvg(
      [
        lineStringFeature([
          [-85.3, 35.0],
          [-85.31, 35.01],
        ]),
      ],
      '#000',
    ) as string;
    const viewBoxMatch = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
    expect(viewBoxMatch).not.toBeNull();
    // ViewBox dimensions should be positive
    const w = Number.parseFloat(viewBoxMatch?.[1]);
    const h = Number.parseFloat(viewBoxMatch?.[2]);
    expect(w).toBeGreaterThan(0);
    expect(h).toBeGreaterThan(0);
  });

  it('returns null for single-point line', () => {
    const svg = buildSvg([lineStringFeature([[-85.3, 35.0]])], '#000');
    expect(svg).toBeNull();
  });
});

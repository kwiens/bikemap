import { describe, it, expect } from 'vitest';
import { parseGpxToRidePoints } from './gpx-parser';

function gpxWrap(tracks: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx xmlns="http://www.topografix.com/GPX/1/1" version="1.1">
${tracks}
</gpx>`;
}

describe('parseGpxToRidePoints', () => {
  it('parses valid GPX with time and elevation', () => {
    const gpx = gpxWrap(`
      <trk><trkseg>
        <trkpt lat="35.0" lon="-85.3">
          <ele>200.5</ele>
          <time>2026-01-15T10:00:00Z</time>
        </trkpt>
        <trkpt lat="35.01" lon="-85.31">
          <ele>210.0</ele>
          <time>2026-01-15T10:01:00Z</time>
        </trkpt>
      </trkseg></trk>
    `);

    const points = parseGpxToRidePoints(gpx);

    expect(points).toHaveLength(2);
    expect(points[0].lat).toBe(35.0);
    expect(points[0].lng).toBe(-85.3);
    expect(points[0].altitude).toBe(200.5);
    expect(points[0].timestamp).toBe(
      new Date('2026-01-15T10:00:00Z').getTime(),
    );
    expect(points[1].lat).toBe(35.01);
    expect(points[1].lng).toBe(-85.31);
  });

  it('generates synthetic timestamps when no time elements present', () => {
    const gpx = gpxWrap(`
      <trk><trkseg>
        <trkpt lat="35.0" lon="-85.3"><ele>200</ele></trkpt>
        <trkpt lat="35.01" lon="-85.31"><ele>210</ele></trkpt>
      </trkseg></trk>
    `);

    const points = parseGpxToRidePoints(gpx);

    expect(points).toHaveLength(2);
    // Second point should be ~1000ms after first
    expect(points[1].timestamp - points[0].timestamp).toBe(1000);
  });

  it('returns altitude null when no ele element', () => {
    const gpx = gpxWrap(`
      <trk><trkseg>
        <trkpt lat="35.0" lon="-85.3">
          <time>2026-01-15T10:00:00Z</time>
        </trkpt>
      </trkseg></trk>
    `);

    const points = parseGpxToRidePoints(gpx);
    expect(points).toHaveLength(1);
    expect(points[0].altitude).toBeNull();
  });

  it('returns empty array for malformed XML', () => {
    expect(parseGpxToRidePoints('not xml at all <<<<')).toEqual([]);
  });

  it('returns empty array when no trkpt elements', () => {
    const gpx = gpxWrap('<trk><trkseg></trkseg></trk>');
    expect(parseGpxToRidePoints(gpx)).toEqual([]);
  });

  it('skips points with invalid coordinates', () => {
    const gpx = gpxWrap(`
      <trk><trkseg>
        <trkpt lat="abc" lon="-85.3"><time>2026-01-15T10:00:00Z</time></trkpt>
        <trkpt lat="35.0" lon="-85.3"><time>2026-01-15T10:01:00Z</time></trkpt>
      </trkseg></trk>
    `);

    const points = parseGpxToRidePoints(gpx);
    expect(points).toHaveLength(1);
    expect(points[0].lat).toBe(35.0);
  });

  it('handles mixed timestamp presence', () => {
    const gpx = gpxWrap(`
      <trk><trkseg>
        <trkpt lat="35.0" lon="-85.3">
          <time>2026-01-15T10:00:00Z</time>
        </trkpt>
        <trkpt lat="35.01" lon="-85.31"></trkpt>
      </trkseg></trk>
    `);

    const points = parseGpxToRidePoints(gpx);
    expect(points).toHaveLength(2);
    // First has real time, second should get synthetic
    expect(points[0].timestamp).toBe(
      new Date('2026-01-15T10:00:00Z').getTime(),
    );
    // Second point has no time — gets baseTime + index*1000
    expect(typeof points[1].timestamp).toBe('number');
  });
});

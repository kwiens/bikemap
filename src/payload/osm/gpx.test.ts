/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { lengthMeters } from './assemble';
import { parseGpx, SIMPLIFY_WINDOW_POINTS, simplifyLine } from './gpx';

function gpx(
  body: string,
  root = '<gpx xmlns="http://www.topografix.com/GPX/1/1" version="1.1">',
): string {
  return `<?xml version="1.0" encoding="UTF-8"?>${root}${body}</gpx>`;
}

function trkpts(points: [number, number][]): string {
  return points
    .map(
      ([lng, lat]) =>
        `<trkpt lat="${lat}" lon="${lng}"><ele>1000</ele></trkpt>`,
    )
    .join('');
}

/** A gently curving line sampled every ~1 m, like a one-second recording. */
function denseCurve(count: number): [number, number][] {
  return Array.from({ length: count }, (_, i) => [
    -121.4 + i * 0.00001,
    44.0 + Math.sin(i / 200) * 0.001,
  ]);
}

describe('parseGpx', () => {
  it('reads each track segment as its own part', () => {
    const parsed = parseGpx(
      gpx(`<trk><name>Lower Whoops</name>
        <trkseg>${trkpts([
          [-121.4, 44.0],
          [-121.39, 44.01],
        ])}</trkseg>
        <trkseg>${trkpts([
          [-121.38, 44.02],
          [-121.37, 44.03],
        ])}</trkseg>
      </trk>`),
    );

    expect(parsed).toEqual({
      error: null,
      name: 'Lower Whoops',
      ok: true,
      parts: [
        [
          [-121.4, 44.0],
          [-121.39, 44.01],
        ],
        [
          [-121.38, 44.02],
          [-121.37, 44.03],
        ],
      ],
      pointsRead: 4,
    });
  });

  it('falls back to routes when there are no tracks', () => {
    const parsed = parseGpx(
      gpx(`<metadata><name>Planned</name></metadata>
        <rte><rtept lat="44.0" lon="-121.4"/><rtept lat="44.01" lon="-121.39"/></rte>`),
    );

    expect(parsed.ok && parsed.parts).toEqual([
      [
        [-121.4, 44.0],
        [-121.39, 44.01],
      ],
    ]);
    expect(parsed.ok && parsed.name).toBe('Planned');
  });

  it('reads GPX 1.0 and namespace-prefixed files', () => {
    const v10 = parseGpx(
      gpx(
        `<name>Old file</name><trk><trkseg>${trkpts([
          [-121.4, 44.0],
          [-121.39, 44.01],
        ])}</trkseg></trk>`,
        '<gpx xmlns="http://www.topografix.com/GPX/1/0" version="1.0">',
      ),
    );
    expect(v10.ok && v10.name).toBe('Old file');

    const prefixed = parseGpx(
      `<g:gpx xmlns:g="http://www.topografix.com/GPX/1/1"><g:trk><g:trkseg>
        <g:trkpt lat="44.0" lon="-121.4"/><g:trkpt lat="44.01" lon="-121.39"/>
      </g:trkseg></g:trk></g:gpx>`,
    );
    expect(prefixed.ok && prefixed.parts).toHaveLength(1);
  });

  it('skips invalid points and drops repeated fixes', () => {
    const parsed = parseGpx(
      gpx(`<trk><trkseg>
        <trkpt lat="44.0" lon="-121.4"/>
        <trkpt lat="44.0" lon="-121.4"/>
        <trkpt lat="abc" lon="-121.395"/>
        <trkpt lat="95" lon="-121.395"/>
        <trkpt lon="-121.395"/>
        <trkpt lat="44.01" lon="-121.39"/>
      </trkseg></trk>`),
    );

    expect(parsed.ok && parsed.parts).toEqual([
      [
        [-121.4, 44.0],
        [-121.39, 44.01],
      ],
    ]);
    expect(parsed.ok && parsed.pointsRead).toBe(2);
  });

  it('skips points with blank coordinates instead of plotting them at 0', () => {
    const parsed = parseGpx(
      gpx(`<trk><trkseg>
        <trkpt lat="44.0" lon="-121.4"/>
        <trkpt lat="" lon="-121.395"/>
        <trkpt lat="44.005" lon="  "/>
        <trkpt lat="44.01" lon="-121.39"/>
      </trkseg></trk>`),
    );

    expect(parsed.ok && parsed.parts).toEqual([
      [
        [-121.4, 44.0],
        [-121.39, 44.01],
      ],
    ]);
  });

  it('refuses files with more points than it will simplify', () => {
    // jsdom's XML parser is far slower than a browser's, so the limit is
    // exercised at a small size rather than the real one.
    const parsed = parseGpx(
      gpx(`<trk>
        <trkseg>${trkpts([
          [-121.4, 44.0],
          [-121.39, 44.01],
        ])}</trkseg>
        <trkseg>${trkpts([
          [-121.38, 44.02],
          [-121.37, 44.03],
        ])}</trkseg>
      </trk>`),
      { maxPoints: 3 },
    );

    expect(parsed).toEqual({
      error: expect.stringContaining('the limit is'),
      ok: false,
    });
  });

  it('drops segments too short to draw', () => {
    const parsed = parseGpx(
      gpx(`<trk>
        <trkseg>${trkpts([[-121.5, 44.0]])}</trkseg>
        <trkseg>${trkpts([
          [-121.4, 44.0],
          [-121.39, 44.01],
        ])}</trkseg>
      </trk>`),
    );

    expect(parsed.ok && parsed.parts).toHaveLength(1);
  });

  it('refuses files with nothing to draw', () => {
    expect(parseGpx('not xml at all').ok).toBe(false);
    expect(parseGpx('<kml><Placemark/></kml>').ok).toBe(false);
    expect(parseGpx(gpx('<wpt lat="44.0" lon="-121.4"/>'))).toEqual({
      error: expect.stringContaining('Waypoints alone'),
      ok: false,
    });
  });

  it('simplifies a dense recording without changing its length much', () => {
    const recording = denseCurve(3000);
    const parsed = parseGpx(
      gpx(`<trk><trkseg>${trkpts(recording)}</trkseg></trk>`),
    );
    if (!parsed.ok) throw new Error(parsed.error);

    const [part] = parsed.parts;
    expect(parsed.pointsRead).toBe(3000);
    expect(part.length).toBeLessThan(150);
    expect(part[0]).toEqual(recording[0]);
    expect(part.at(-1)).toEqual(recording.at(-1));

    const original = lengthMeters([recording]);
    expect(
      Math.abs(lengthMeters(parsed.parts) - original) / original,
    ).toBeLessThan(0.01);
  });
});

describe('simplifyLine', () => {
  it('keeps a corner and drops points along a straight run', () => {
    const line: [number, number][] = [
      [-121.4, 44.0],
      [-121.399, 44.0],
      [-121.398, 44.0],
      [-121.398, 44.001],
      [-121.398, 44.002],
    ];

    expect(simplifyLine(line, 3)).toEqual([
      [-121.4, 44.0],
      [-121.398, 44.0],
      [-121.398, 44.002],
    ]);
  });

  it('keeps a wiggle larger than the tolerance', () => {
    // ~11 m off the line between its neighbours.
    const line: [number, number][] = [
      [-121.4, 44.0],
      [-121.3995, 44.0001],
      [-121.399, 44.0],
    ];

    expect(simplifyLine(line, 3)).toHaveLength(3);
    expect(simplifyLine(line, 20)).toHaveLength(2);
  });

  it('simplifies in bounded windows, keeping each window boundary', () => {
    const count = SIMPLIFY_WINDOW_POINTS * 3 + 1;
    const straight = Array.from(
      { length: count },
      (_, i) => [-121.4 + i * 0.00001, 44.0] as [number, number],
    );

    expect(simplifyLine(straight, 3)).toEqual([
      straight[0],
      straight[SIMPLIFY_WINDOW_POINTS],
      straight[SIMPLIFY_WINDOW_POINTS * 2],
      straight[count - 1],
    ]);
  });

  it('keeps every point of a line that is all detail', () => {
    // A zigzag ~20 m wide: nothing is within tolerance of its neighbours.
    const zigzag = Array.from(
      { length: SIMPLIFY_WINDOW_POINTS * 2 + 7 },
      (_, i) =>
        [-121.4 + i * 0.0001, 44.0 + (i % 2) * 0.0002] as [number, number],
    );

    expect(simplifyLine(zigzag, 3)).toEqual(zigzag);
  });

  it('returns copies, not the caller’s arrays', () => {
    const line: [number, number][] = [
      [-121.4, 44.0],
      [-121.39, 44.01],
    ];
    const simplified = simplifyLine(line, 3);
    simplified[0][0] = 0;

    expect(line[0][0]).toBe(-121.4);
  });
});

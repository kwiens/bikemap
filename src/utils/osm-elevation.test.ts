import { describe, it, expect, vi, beforeAll } from 'vitest';
import {
  traceLengthMeters,
  decodeTerrainRgb,
  densifyLine,
  stitchLines,
  lookupPrecomputedElevation,
} from './osm-elevation';

describe('stitchLines', () => {
  it('orders tile-clipped segments into one continuous path', () => {
    // Three pieces of one way, out of order and one reversed.
    const a: [number, number][] = [
      [0, 0],
      [0, 0.001],
    ];
    const b: [number, number][] = [
      [0, 0.002],
      [0, 0.001],
    ]; // reversed, joins a's tail
    const c: [number, number][] = [
      [0, 0.002],
      [0, 0.003],
    ];
    const path = stitchLines([c, a, b]);
    expect(path[0]).toEqual([0, 0]);
    expect(path[path.length - 1]).toEqual([0, 0.003]);
    // Monotonic in latitude — proves correct ordering.
    for (let i = 1; i < path.length; i++) {
      expect(path[i][1]).toBeGreaterThanOrEqual(path[i - 1][1]);
    }
  });

  it('returns the single line unchanged', () => {
    expect(
      stitchLines([
        [
          [1, 1],
          [1, 2],
        ],
      ]),
    ).toEqual([
      [1, 1],
      [1, 2],
    ]);
  });
});

describe('decodeTerrainRgb', () => {
  it('decodes the Terrain-RGB encoding (meters)', () => {
    // -10000 + (R*65536 + G*256 + B) * 0.1
    expect(decodeTerrainRgb(0, 0, 0)).toBeCloseTo(-10000);
    expect(decodeTerrainRgb(1, 134, 160)).toBeCloseTo(0); // 100000 * 0.1 - 10000
  });
});

describe('traceLengthMeters', () => {
  it('sums haversine length across polylines', () => {
    // ~0.001 deg latitude ≈ 111 m
    const len = traceLengthMeters([
      [
        [0, 0],
        [0, 0.001],
      ],
    ]);
    expect(len).toBeGreaterThan(105);
    expect(len).toBeLessThan(115);
  });

  it('is zero for degenerate input', () => {
    expect(traceLengthMeters([])).toBe(0);
    expect(traceLengthMeters([[[0, 0]]])).toBe(0);
  });
});

describe('densifyLine', () => {
  it('inserts intermediate points while preserving endpoints', () => {
    const line: [number, number][] = [
      [0, 0],
      [0, 0.01], // ~1.1 km
    ];
    const dense = densifyLine(line, 20);
    expect(dense.length).toBeGreaterThan(line.length);
    expect(dense[0]).toEqual([0, 0]);
    expect(dense[dense.length - 1]).toEqual([0, 0.01]);
    // No gap should exceed roughly the step.
    for (let i = 1; i < dense.length; i++) {
      const gapDeg = dense[i][1] - dense[i - 1][1];
      expect(gapDeg * 111000).toBeLessThan(40);
    }
  });

  it('returns short lines unchanged', () => {
    expect(densifyLine([[1, 2]])).toEqual([[1, 2]]);
  });
});

describe('lookupPrecomputedElevation', () => {
  // One region covering [0,0]-[10,10] with a single precomputed way (id 111).
  // Module-level caches persist across calls, so all cases share this dataset.
  beforeAll(() => {
    const json = (body: unknown) =>
      Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.endsWith('/index.json')) {
          return json({
            regions: [
              {
                region: 'testland',
                name: 'Testland',
                bbox: [0, 0, 10, 10],
                file: 'testland.json',
              },
            ],
          });
        }
        if (url.endsWith('/testland.json')) {
          return json({ trails: { '111': [100, 50, 10, 5, 60] } });
        }
        return Promise.resolve({
          ok: false,
          json: () => Promise.resolve(null),
        });
      }),
    );
  });

  it('returns precomputed metrics for a covered way', async () => {
    const hit = await lookupPrecomputedElevation('111', 5, 5);
    expect(hit).toEqual({
      lengthMeters: 100,
      elevation: { gain: 50, loss: 10, min: 5, max: 60 },
    });
  });

  it('returns null for an id not in the region file', async () => {
    expect(await lookupPrecomputedElevation('999', 5, 5)).toBeNull();
  });

  it('returns null when the point is outside every region bbox', async () => {
    expect(await lookupPrecomputedElevation('111', 50, 50)).toBeNull();
  });

  it('returns null when the id is missing', async () => {
    expect(await lookupPrecomputedElevation(null, 5, 5)).toBeNull();
    expect(await lookupPrecomputedElevation(undefined, 5, 5)).toBeNull();
  });
});

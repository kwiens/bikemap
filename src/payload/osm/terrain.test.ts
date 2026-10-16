import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearTileCache,
  densify,
  sampleTerrain,
  sampleTerrainParts,
} from './terrain';

// sharp is a native decoder for PNG bytes; the fixtures below are already raw
// RGB, so the decode is a pass-through here.
vi.mock('sharp', () => ({
  default: (buffer: Buffer) => ({
    raw: () => ({
      toBuffer: async () => ({ data: buffer, info: { channels: 3 } }),
    }),
  }),
}));

const TILE_SIZE = 256;
const TOKEN = 'test-token';
const realFetch = globalThis.fetch;

/** A tile of uniform altitude, encoded the way Terrain-RGB encodes it. */
function tileBuffer(altitudeMeters: number): Buffer {
  const value = Math.round((altitudeMeters + 10000) / 0.1);
  const buffer = Buffer.alloc(TILE_SIZE * TILE_SIZE * 3);
  for (let pixel = 0; pixel < TILE_SIZE * TILE_SIZE; pixel++) {
    buffer[pixel * 3] = (value >> 16) & 0xff;
    buffer[pixel * 3 + 1] = (value >> 8) & 0xff;
    buffer[pixel * 3 + 2] = value & 0xff;
  }
  return buffer;
}

function okTile(altitudeMeters: number): Response {
  return {
    arrayBuffer: async () => tileBuffer(altitudeMeters),
    ok: true,
    status: 200,
  } as unknown as Response;
}

function errorTile(status: number): Response {
  return {
    arrayBuffer: async () => Buffer.alloc(0),
    ok: false,
    status,
  } as unknown as Response;
}

function setFetchStub(stub: ReturnType<typeof vi.fn>) {
  globalThis.fetch = stub as unknown as typeof fetch;
  return stub;
}

const LINE: [number, number][] = [
  [-121.4, 44.0],
  [-121.39, 44.0],
];

beforeEach(() => {
  clearTileCache();
});

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

describe('sampleTerrain tile caching', () => {
  it('retries a tile that failed with a server error on a later call', async () => {
    let broken = true;
    const stub = setFetchStub(
      vi.fn(async () => (broken ? errorTile(500) : okTile(100))),
    );

    expect(await sampleTerrain(LINE, TOKEN)).toBeNull();
    const afterFailure = stub.mock.calls.length;
    expect(afterFailure).toBeGreaterThan(0);

    // The blip is over; the second save must not inherit the first one's
    // failure, or the trail has no elevation until the server restarts.
    broken = false;
    const points = await sampleTerrain(LINE, TOKEN);

    expect(stub.mock.calls.length).toBeGreaterThan(afterFailure);
    expect(points).not.toBeNull();
    expect(points?.[0].altitude).toBeCloseTo(100, 1);
  });

  it('retries a tile whose request threw', async () => {
    let broken = true;
    const stub = setFetchStub(
      vi.fn(async () => {
        if (broken) {
          throw new Error('socket hang up');
        }
        return okTile(250);
      }),
    );

    expect(await sampleTerrain(LINE, TOKEN)).toBeNull();
    const afterFailure = stub.mock.calls.length;

    broken = false;
    const points = await sampleTerrain(LINE, TOKEN);

    expect(stub.mock.calls.length).toBeGreaterThan(afterFailure);
    expect(points?.[0].altitude).toBeCloseTo(250, 1);
  });

  it('caches a 404 — the DEM genuinely has nothing there', async () => {
    const stub = setFetchStub(vi.fn(async () => errorTile(404)));

    expect(await sampleTerrain(LINE, TOKEN)).toBeNull();
    const afterFirst = stub.mock.calls.length;
    expect(afterFirst).toBeGreaterThan(0);

    expect(await sampleTerrain(LINE, TOKEN)).toBeNull();

    expect(stub.mock.calls.length).toBe(afterFirst);
  });

  it('serves a decoded tile from the cache rather than refetching it', async () => {
    const stub = setFetchStub(vi.fn(async () => okTile(100)));

    await sampleTerrain(LINE, TOKEN);
    const afterFirst = stub.mock.calls.length;
    await sampleTerrain(LINE, TOKEN);

    expect(stub.mock.calls.length).toBe(afterFirst);
  });
});

describe('sampleTerrainParts', () => {
  it('samples each part on its own, never across the gap between them', async () => {
    setFetchStub(vi.fn(async () => okTile(100)));

    const near: [number, number][] = [
      [-121.4, 44.0],
      [-121.39, 44.0],
    ];
    const far: [number, number][] = [
      [-120.5, 44.9],
      [-120.49, 44.9],
    ];

    const sampled = await sampleTerrainParts([near, far], TOKEN);

    expect(sampled).toHaveLength(2);
    // Every sample belongs to the part it was taken from; nothing lands on the
    // ~80 km of ground between them.
    expect(
      sampled?.[0].every((point) => point.lng <= -121.38 && point.lat < 44.5),
    ).toBe(true);
    expect(
      sampled?.[1].every((point) => point.lng >= -120.51 && point.lat > 44.5),
    ).toBe(true);
  });

  it('ignores parts too short to draw and returns null when none are usable', async () => {
    setFetchStub(vi.fn(async () => okTile(100)));

    expect(await sampleTerrainParts([[[-121.4, 44.0]]], TOKEN)).toBeNull();
    expect(await sampleTerrainParts([], TOKEN)).toBeNull();
  });
});

describe('terrain sampling budgets', () => {
  it('bounds a long segment before expanding intermediate samples', () => {
    const line: [number, number][] = [
      [0, 0],
      [0.02, 0],
    ];
    const points = densify(line, 20, 4);
    expect(points.length).toBeLessThanOrEqual(4);
    expect(points[0]).toEqual(line[0]);
    expect(points.at(-1)).toEqual(line[1]);
  });

  it('keeps ordinary samples and every original bend', () => {
    const line: [number, number][] = [
      [0, 0],
      [0.001, 0],
      [0.001, 0.001],
    ];
    const points = densify(line, 20, 20);
    expect(points).toHaveLength(11);
    for (const point of line) expect(points).toContainEqual(point);
  });

  it('uses spare samples across many similar segments', () => {
    const line: [number, number][] = Array.from({ length: 5 }, (_, index) => [
      index * 0.0004,
      0,
    ]);
    const points = densify(line, 20, 8);
    expect(points).toHaveLength(8);
    for (const point of line) expect(points).toContainEqual(point);
  });

  it('declines dense geometry rather than dropping vertices and reporting false elevations', async () => {
    const fetch = setFetchStub(vi.fn(async () => okTile(100)));
    expect(
      await sampleTerrain(
        [
          [0, 0],
          [0.001, 0],
          [0, 0],
        ],
        TOKEN,
        2,
      ),
    ).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('reserves vertices across parts before distributing the remaining samples', async () => {
    setFetchStub(vi.fn(async () => okTile(100)));
    const parts: [number, number][][] = [
      [
        [0, 0],
        [0.02, 0],
      ],
      [
        [1, 1],
        [1.000001, 1],
      ],
      [
        [2, 2],
        [2.000001, 2],
      ],
    ];
    const result = await sampleTerrainParts(parts, TOKEN, 8);
    expect(result).toHaveLength(3);
    expect(result?.flat().length).toBeLessThanOrEqual(8);
    result?.forEach((part, index) => {
      expect([part[0].lng, part[0].lat]).toEqual(parts[index][0]);
      expect([part.at(-1)?.lng, part.at(-1)?.lat]).toEqual(parts[index][1]);
    });
  });

  it('uses a spare sample when equal parts each receive a fractional share', async () => {
    setFetchStub(vi.fn(async () => okTile(100)));
    const parts: [number, number][][] = [
      [
        [0, 0],
        [0.02, 0],
      ],
      [
        [1, 1],
        [1.02, 1],
      ],
    ];
    const result = await sampleTerrainParts(parts, TOKEN, 5);
    expect(result?.flat()).toHaveLength(5);
    expect(result).toHaveLength(2);
  });

  it('declines the entire profile when part vertices exceed the whole-trail budget', async () => {
    const fetch = setFetchStub(vi.fn(async () => okTile(100)));
    expect(await sampleTerrainParts([LINE, LINE, LINE], TOKEN, 4)).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([0, 1, -1, 2.5, Number.NaN, Number.POSITIVE_INFINITY, 8001])(
    'declines invalid sample budget %s without tile requests',
    async (budget) => {
      const fetch = setFetchStub(vi.fn(async () => okTile(100)));
      expect(await sampleTerrain(LINE, TOKEN, budget)).toBeNull();
      expect(await sampleTerrainParts([LINE], TOKEN, budget)).toBeNull();
      expect(fetch).not.toHaveBeenCalled();
    },
  );
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { measureParts } from './measure';
import { clearTileCache } from './terrain';
import { M_TO_FT } from './units';

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
const TERRAIN_ZOOM = 14;
const TOKEN = 'test-token';
const FEET_PER_MILE = 5280;
const realFetch = globalThis.fetch;

const LOW_M = 100;
const HIGH_M = 900;

/**
 * The synthetic DEM: everything west of this tile column sits at {@link LOW_M},
 * everything east of it at {@link HIGH_M}. Two parts placed either side of it
 * are each on flat ground, so any gain or loss in the result came from walking
 * the ground between them.
 */
function tileX(lng: number): number {
  return Math.floor(((lng + 180) / 360) * 2 ** TERRAIN_ZOOM);
}
const DIVIDE_X = tileX(-121.0);

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

function stubTerrain() {
  const stub = vi.fn(async (url: string) => {
    const [, x] = /terrain-rgb\/\d+\/(\d+)\/(\d+)/.exec(url) ?? [];
    const altitude = Number(x) < DIVIDE_X ? LOW_M : HIGH_M;
    return {
      arrayBuffer: async () => tileBuffer(altitude),
      ok: true,
      status: 200,
    } as unknown as Response;
  });
  globalThis.fetch = stub as unknown as typeof fetch;
  return stub;
}

// Two ~800 m pieces of one trail, 80 km apart, each on its own flat plateau.
const WEST: [number, number][] = [
  [-121.4, 44.0],
  [-121.39, 44.0],
];
const EAST: [number, number][] = [
  [-120.5, 44.9],
  [-120.49, 44.9],
];

beforeEach(() => {
  clearTileCache();
  stubTerrain();
});

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

describe('measureParts', () => {
  it('does not climb the ground between disconnected parts', async () => {
    const measured = await measureParts([WEST, EAST], 'Split Trail', {
      mapboxToken: TOKEN,
    });

    // Each part is flat; the 800 m rise between the plateaus is not the trail's.
    expect(measured.elevationGain).toBe(0);
    expect(measured.elevationLoss).toBe(0);
    expect(measured.elevationMin).toBe(Math.round(LOW_M * M_TO_FT));
    expect(measured.elevationMax).toBe(Math.round(HIGH_M * M_TO_FT));
    expect(measured.warnings).toEqual([]);
  });

  it('reports a profile distance that matches the stored distance', async () => {
    const measured = await measureParts([WEST, EAST], 'Split Trail', {
      mapboxToken: TOKEN,
    });

    const profile = measured.profile;
    expect(profile).not.toBeNull();
    if (!profile) {
      return;
    }

    // The pane's headline and the sidebar's number are the same measurement.
    // `distance` is stored rounded to hundredths of a mile, so agreement is
    // asserted at that resolution.
    expect(profile.distance / FEET_PER_MILE).toBeCloseTo(measured.distance, 1);

    // ...and so is the axis the chart is drawn on: the ~80 km hop between the
    // parts appears nowhere in it.
    const last = profile.profile[profile.profile.length - 1][0];
    expect(Math.abs(last - profile.distance)).toBeLessThan(5);
    const steps = profile.profile
      .slice(1)
      .map((point, index) => point[0] - profile.profile[index][0]);
    expect(Math.max(...steps)).toBeLessThan(500);
    expect(Math.min(...steps)).toBeGreaterThanOrEqual(0);
  });

  it('measures a single continuous part against its own length', async () => {
    const measured = await measureParts([WEST], 'Whole Trail', {
      mapboxToken: TOKEN,
    });

    expect(measured.distance).toBeGreaterThan(0);
    expect(measured.elevationGain).toBe(0);
    expect((measured.profile?.distance ?? 0) / FEET_PER_MILE).toBeCloseTo(
      measured.distance,
      1,
    );
  });

  it('warns rather than storing a flat line when no terrain can be read', async () => {
    globalThis.fetch = vi.fn(
      async () => ({ ok: false, status: 404 }) as unknown as Response,
    ) as unknown as typeof fetch;

    const measured = await measureParts([WEST], 'Whole Trail', {
      mapboxToken: TOKEN,
    });

    expect(measured.profile).toBeNull();
    expect(measured.elevationGain).toBeNull();
    expect(measured.distance).toBeGreaterThan(0);
    expect(measured.warnings.join(' ')).toMatch(/no elevation data/i);
  });
});

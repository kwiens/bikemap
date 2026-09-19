import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { ValidationError } from 'payload';
import { resolveTrailGeometry } from './resolveTrailGeometry';

/**
 * The hook's job is deciding *which* geometry wins on save, and the expensive
 * mistake is calling Overpass when it shouldn't — either hammering a shared
 * community endpoint, or refetching ways and silently discarding an editor's
 * hand-drawn line. So these assert on what the hook does and does not fetch.
 *
 * Elevation is switched off by clearing the Mapbox token, which is the same
 * path a deployment without one takes.
 */

const A: [number, number] = [-121.4, 44.0];
const B: [number, number] = [-121.39, 44.01];
const C: [number, number] = [-121.38, 44.02];

const realFetch = globalThis.fetch;
let fetched: number;

function logger() {
  return { error: vi.fn(), info: vi.fn(), warn: vi.fn() };
}

type HookArgs = Parameters<typeof resolveTrailGeometry>[0];

function run(args: {
  context?: Record<string, unknown>;
  data: Record<string, unknown>;
  operation?: 'create' | 'update';
  originalDoc?: Record<string, unknown>;
}) {
  return resolveTrailGeometry({
    collection: { slug: 'trails' },
    context: args.context ?? {},
    data: args.data,
    operation: args.operation ?? 'update',
    originalDoc: args.originalDoc,
    req: { payload: { logger: logger() } },
  } as unknown as HookArgs) as Promise<Record<string, unknown>>;
}

function multiLine(...parts: [number, number][][]) {
  return { coordinates: parts, type: 'MultiLineString' };
}

/** Answers the one Overpass call a rebuild makes, with the given elements. */
function overpassReturns(elements: unknown[]) {
  globalThis.fetch = (() => {
    fetched += 1;
    return Promise.resolve({
      json: () => Promise.resolve({ elements }),
      ok: true,
      status: 200,
      text: () => Promise.resolve(''),
    });
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  fetched = 0;
  // Any network call from a path that shouldn't make one is a test failure, not
  // a slow test.
  globalThis.fetch = (() => {
    fetched += 1;
    throw new Error('the hook made a network request');
  }) as unknown as typeof fetch;
  vi.stubEnv('NEXT_PUBLIC_MAPBOX_TOKEN', '');
});

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.unstubAllEnvs();
});

describe('edited geometry', () => {
  it('measures the line as drawn, without touching OSM', async () => {
    // The whole point of flipping to 'edited': the ways are still referenced,
    // but they no longer decide what the trail looks like.
    const result = await run({
      data: {
        displayName: 'Phil’s',
        geom: multiLine([A, B, C]),
        geometrySource: 'edited',
        osmIds: [1, 2],
      },
      originalDoc: { geom: multiLine([A, B]) },
    });

    expect(fetched).toBe(0);
    expect(result.geom).toEqual(multiLine([A, B, C]));
    expect(result.distance).toBeGreaterThan(0);
    expect(result.bounds).toEqual([-121.4, 44.0, -121.38, 44.02]);
    expect((result.osmReport as { source: string }).source).toBe('edited');
  });

  it('reports a break between disconnected pieces', async () => {
    // Dragging an endpoint away from its neighbour opens a gap just as surely
    // as picking the wrong way does, so it gets the same warning.
    const far: [number, number] = [-121.0, 44.5];
    const result = await run({
      data: {
        geom: multiLine([A, B], [far, [-120.99, 44.51]]),
        geometrySource: 'edited',
      },
      originalDoc: {},
    });

    const report = result.osmReport as {
      gaps: { distanceMeters: number }[];
      warnings: string[];
    };
    expect(report.gaps[0].distanceMeters).toBeGreaterThan(1000);
    expect(report.warnings.join(' ')).toMatch(/disconnected pieces/);
  });

  it('skips re-measuring when the line has not moved', async () => {
    // Most saves of an edited trail change a name or a rating. Re-sampling the
    // DEM for those would be pure waste.
    const geom = multiLine([A, B]);
    const result = await run({
      data: { displayName: 'Renamed', geom, geometrySource: 'edited' },
      originalDoc: { distance: 1.23, geom },
    });

    // No fresh report means nothing was measured; the stored distance stands.
    expect(result.osmReport).toBeNull();
    expect(result.distance).toBe(1.23);
    expect(result.geom).toEqual(geom);
  });

  it('does not take measurements from the client', async () => {
    // The derived fields are read-only in the admin, but the REST and Local
    // APIs still accept them on the wire, and this save recomputes nothing.
    const geom = multiLine([A, B]);
    const result = await run({
      data: {
        distance: 999,
        elevationGain: 1,
        geom,
        geometrySource: 'edited',
      },
      originalDoc: { distance: 1.23, elevationGain: 300, geom },
    });

    expect(result.distance).toBe(1.23);
    expect(result.elevationGain).toBe(300);
    expect(result.geom).toEqual(geom);
  });

  it('re-measures an unchanged line when explicitly asked', async () => {
    const geom = multiLine([A, B]);
    const result = await run({
      data: { geom, geometrySource: 'edited', rebuildGeometry: true },
      originalDoc: { distance: 1.23, geom },
    });

    expect(result.distance).toBeGreaterThan(0);
    expect(result.rebuildGeometry).toBe(false);
  });

  it('rejects the save when the submitted line is invalid', async () => {
    // Payload runs collection beforeChange hooks *before* field validation, so
    // the field's `validate` never sees a bad value on the server — it only
    // sees what this hook returns. Silently substituting the old line here
    // would let the save succeed while the editor's work vanished.
    const failed = await run({
      data: {
        geom: { coordinates: [[[-121.4, 244.0], B]], type: 'MultiLineString' },
        geometrySource: 'edited',
      },
      originalDoc: { geom: multiLine([A, B]) },
    }).catch((error: unknown) => error as ValidationError);

    expect(failed).toBeInstanceOf(ValidationError);
    // The per-field message is what the admin renders against the map editor;
    // ValidationError's own message is only ever the generic summary.
    expect((failed as ValidationError).data.errors).toEqual([
      { message: expect.stringMatching(/longitude, latitude/), path: 'geom' },
    ]);
  });

  it('clears the measurements when every point is deleted', async () => {
    // Otherwise a distance stays attached to a trail that no longer has a line.
    const result = await run({
      data: { geom: null, geometrySource: 'edited' },
      originalDoc: { distance: 4.2, geom: multiLine([A, B]) },
    });

    expect(result.geom).toBeNull();
    expect(result.distance).toBeNull();
    expect(result.bounds).toBeNull();
    expect(result.elevationGain).toBeNull();
  });
});

describe('other sources', () => {
  it('leaves an imported trail completely alone', async () => {
    const data = {
      distance: 9.9,
      geom: multiLine([A, B]),
      geometrySource: 'imported',
    };
    expect(await run({ data, originalDoc: {} })).toEqual(data);
    expect(fetched).toBe(0);
  });

  it('leaves a bulk import alone', async () => {
    // Without this, seeding a few hundred trails fires one Overpass request per
    // row and gets the machine rate-limited.
    const data = { geometrySource: 'osm', osmIds: [1, 2, 3] };
    expect(
      await run({ context: { skipOsmRebuild: true }, data, originalDoc: {} }),
    ).toEqual(data);
    expect(fetched).toBe(0);
  });

  it('does not refetch OSM ways that have not changed', async () => {
    const result = await run({
      data: { geometrySource: 'osm', osmIds: [1, 2] },
      originalDoc: { geom: multiLine([A, B]), osmIds: [1, 2] },
    });

    expect(fetched).toBe(0);
    expect(result.rebuildGeometry).toBe(false);
  });

  it('leaves the ways alone when a save does not mention them', async () => {
    // A partial update — publishing a draft over the API, say — carries no
    // osmIds key at all. Reading that as "the curator removed every way" would
    // wipe the line off a trail that nobody touched.
    const geom = multiLine([A, B]);
    const result = await run({
      data: { _status: 'published' },
      originalDoc: {
        distance: 4.2,
        geom,
        geometrySource: 'osm',
        osmIds: [1, 2],
      },
    });

    expect(fetched).toBe(0);
    expect(result.geom).toEqual(geom);
    expect(result.distance).toBe(4.2);
  });

  it('does not take the line or its numbers from the client', async () => {
    // Nothing is rebuilt on this save, so a submitted geometry or distance has
    // no authority over what is already stored.
    const stored = multiLine([A, B]);
    const result = await run({
      data: {
        distance: 999,
        elevationGain: 1,
        geom: multiLine([A, C]),
        geometrySource: 'osm',
        osmIds: [1, 2],
      },
      originalDoc: {
        distance: 4.2,
        elevationGain: 300,
        geom: stored,
        osmIds: [1, 2],
      },
    });

    expect(fetched).toBe(0);
    expect(result.geom).toEqual(stored);
    expect(result.distance).toBe(4.2);
    expect(result.elevationGain).toBe(300);
  });

  it('clears every derived value when the last way is removed', async () => {
    // A trail with no ways has no line, and nothing may outlive that line — a
    // leftover distance or chart would describe geometry that is gone.
    const result = await run({
      data: { geometrySource: 'osm', osmIds: [] },
      originalDoc: {
        bounds: [-121.4, 44.0, -121.39, 44.01],
        distance: 4.2,
        elevationGain: 300,
        elevationLoss: 280,
        elevationMax: 6000,
        elevationMin: 5000,
        elevationProfile: { name: 'Phil’s', points: [] },
        geom: multiLine([A, B]),
        osmIds: [1],
        osmReport: { source: 'osm' },
      },
    });

    for (const field of [
      'bounds',
      'distance',
      'elevationGain',
      'elevationLoss',
      'elevationMax',
      'elevationMin',
      'elevationProfile',
      'geom',
      'osmReport',
    ]) {
      expect(result[field], field).toBeNull();
    }
  });

  it('keeps the stored line when a rebuild resolves nothing', async () => {
    // Every way deleted or renumbered upstream. Emptying the trail would take a
    // published line off the map on the strength of an upstream edit, so the
    // line and its numbers stay together and the report says they are stale.
    overpassReturns([]);

    const result = await run({
      data: { geometrySource: 'osm', osmIds: [7], rebuildGeometry: true },
      originalDoc: {
        bounds: [-121.4, 44.0, -121.39, 44.01],
        distance: 4.2,
        elevationGain: 300,
        geom: multiLine([A, B]),
        osmIds: [7],
      },
    });

    expect(fetched).toBe(1);
    expect(result.geom).toEqual(multiLine([A, B]));
    expect(result.distance).toBe(4.2);
    expect(result.elevationGain).toBe(300);
    expect(result.bounds).toEqual([-121.4, 44.0, -121.39, 44.01]);

    const report = result.osmReport as {
      missingIds: number[];
      warnings: string[];
    };
    expect(report.missingIds).toEqual([7]);
    expect(report.warnings.join(' ')).toMatch(/re-pick the trail/);
  });
});

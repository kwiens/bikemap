import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildTrailFromOsm } from './build';

// Overpass is a shared community endpoint, so these stub it rather than calling
// it. Terrain sampling is switched off (`withElevation: false`) for the same
// reason — it's covered against the real DEM by the Bend comparison in
// docs/guides/osm-trail-editor.md.
const realFetch = globalThis.fetch;

function stubOverpass(
  ways: { id: number; geometry: [number, number][] }[],
  status = 200,
  headers = new Headers(),
) {
  // Assigned directly rather than via vi.spyOn: a spy on globalThis.fetch
  // survived restoreAllMocks here, so call history leaked between tests and
  // made assertions pass or fail depending on what ran before them.
  const stub = vi.fn(
    async () =>
      ({
        headers,
        json: async () => ({
          elements: ways.map((way) => ({
            geometry: way.geometry.map(([lon, lat]) => ({ lat, lon })),
            id: way.id,
            tags: {},
            type: 'way',
          })),
        }),
        ok: status === 200,
        status,
        text: async () => '',
      }) as Response,
  );
  globalThis.fetch = stub as unknown as typeof fetch;
  return stub;
}

/**
 * Records the delays the retry loop asks for and runs each one out immediately.
 *
 * The delays are the point of the assertion, and a suite that actually slept
 * them would take seconds per test — so the clock is stubbed rather than
 * advanced, which also reads the requested delay straight off the call.
 */
function captureRetryDelays(): number[] {
  const delays: number[] = [];
  vi.spyOn(globalThis, 'setTimeout').mockImplementation(((
    callback: () => void,
    ms?: number,
  ) => {
    delays.push(ms ?? 0);
    callback();
    return 0;
  }) as unknown as typeof globalThis.setTimeout);
  return delays;
}

const A: [number, number] = [-121.4, 44.0];
const B: [number, number] = [-121.39, 44.01];
const C: [number, number] = [-121.38, 44.02];
const FAR: [number, number] = [-120.5, 44.9];

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

describe('buildTrailFromOsm', () => {
  it('builds geometry, distance and bounds from way ids', async () => {
    stubOverpass([
      { geometry: [A, B], id: 1 },
      { geometry: [B, C], id: 2 },
    ]);

    const built = await buildTrailFromOsm([1, 2], 'Test Trail', {
      withElevation: false,
    });

    expect(built.geometry?.type).toBe('MultiLineString');
    expect(built.geometry?.coordinates).toHaveLength(1);
    expect(built.distance).toBeGreaterThan(0);
    expect(built.bounds).toEqual([-121.4, 44.0, -121.38, 44.02]);
    expect(built.report.resolvedIds).toEqual([1, 2]);
    expect(built.report.warnings).toEqual([]);
  });

  it('does no work and reports nothing for an empty id list', async () => {
    const fetchSpy = stubOverpass([]);

    const built = await buildTrailFromOsm([], 'Test Trail');

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(built.geometry).toBeNull();
    expect(built.distance).toBe(0);
  });

  it('warns about ways that no longer exist upstream', async () => {
    // Way 2 was deleted or renumbered in OSM — the classic failure mode of
    // referencing OSM by id.
    stubOverpass([{ geometry: [A, B], id: 1 }]);

    const built = await buildTrailFromOsm([1, 2], 'Test Trail', {
      withElevation: false,
    });

    expect(built.report.missingIds).toEqual([2]);
    expect(built.report.warnings.join(' ')).toMatch(/no longer exist/i);
    // The rest of the trail is still built rather than the save being lost.
    expect(built.geometry).not.toBeNull();
  });

  it('warns when the picked ways do not connect', async () => {
    stubOverpass([
      { geometry: [A, B], id: 1 },
      { geometry: [FAR, [-120.49, 44.91]], id: 2 },
    ]);

    const built = await buildTrailFromOsm([1, 2], 'Test Trail', {
      withElevation: false,
    });

    expect(built.geometry?.coordinates).toHaveLength(2);
    expect(built.report.gaps).toHaveLength(1);
    expect(built.report.warnings.join(' ')).toMatch(/disconnected/i);
  });

  it('reports clearly when no ways resolve at all', async () => {
    stubOverpass([]);

    const built = await buildTrailFromOsm([1, 2], 'Test Trail', {
      withElevation: false,
    });

    expect(built.geometry).toBeNull();
    expect(built.report.missingIds).toEqual([1, 2]);
    expect(built.report.warnings.join(' ')).toMatch(/could be found/i);
  });

  it('ignores duplicate and invalid ids before calling Overpass', async () => {
    const fetchSpy = stubOverpass([{ geometry: [A, B], id: 1 }]);

    await buildTrailFromOsm([1, 1, 0, -5, Number.NaN], 'Test Trail', {
      withElevation: false,
    });

    // vi.fn() with a zero-arg implementation types its calls as [], so read the
    // recorded arguments through the fetch signature instead.
    const [, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.body).toContain('way(id:1)');
  });

  it('surfaces a persistent Overpass outage as an error, not silent data loss', async () => {
    captureRetryDelays();
    const stub = stubOverpass([], 429);

    await expect(
      buildTrailFromOsm([1], 'Test Trail', { withElevation: false }),
    ).rejects.toThrow(/busy/i);

    expect(stub).toHaveBeenCalledTimes(3);
  });

  it('backs off between retries when the 429 carries no Retry-After', async () => {
    // The common Overpass 429 has no Retry-After at all, and retrying with no
    // wait is worse than not retrying against a shared endpoint.
    const delays = captureRetryDelays();
    stubOverpass([], 429);

    await expect(
      buildTrailFromOsm([1], 'Test Trail', { withElevation: false }),
    ).rejects.toThrow(/busy/i);

    expect(delays).toEqual([2000, 4000]);
  });

  it('honours a Retry-After the server does send', async () => {
    const delays = captureRetryDelays();
    stubOverpass([], 503, new Headers({ 'Retry-After': '5' }));

    await expect(
      buildTrailFromOsm([1], 'Test Trail', { withElevation: false }),
    ).rejects.toThrow(/busy/i);

    expect(delays).toEqual([5000, 5000]);
  });

  it('honours an explicit Retry-After of zero rather than reading it as absent', async () => {
    const delays = captureRetryDelays();
    stubOverpass([], 503, new Headers({ 'Retry-After': '0' }));

    await expect(
      buildTrailFromOsm([1], 'Test Trail', { withElevation: false }),
    ).rejects.toThrow(/busy/i);

    expect(delays).toEqual([0, 0]);
  });

  it('falls back to backoff when Retry-After is an HTTP-date', async () => {
    const delays = captureRetryDelays();
    stubOverpass(
      [],
      503,
      new Headers({ 'Retry-After': 'Wed, 21 Oct 2015 07:28:00 GMT' }),
    );

    await expect(
      buildTrailFromOsm([1], 'Test Trail', { withElevation: false }),
    ).rejects.toThrow(/busy/i);

    expect(delays).toEqual([2000, 4000]);
  });

  it('caps an unreasonably long Retry-After so a save is not held open', async () => {
    const delays = captureRetryDelays();
    stubOverpass([], 503, new Headers({ 'Retry-After': '3600' }));

    await expect(
      buildTrailFromOsm([1], 'Test Trail', { withElevation: false }),
    ).rejects.toThrow(/busy/i);

    expect(delays).toEqual([30_000, 30_000]);
  });
});

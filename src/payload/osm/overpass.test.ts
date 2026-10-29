import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchTrailNetwork,
  fetchWaysByIds,
  OverpassError,
  readOverpassElements,
} from './overpass';

const TIMED_OUT =
  'runtime error: Query timed out in "query" at line 1 after 60 seconds.';

const WAY = {
  geometry: [
    { lat: 44, lon: -121.3 },
    { lat: 44.001, lon: -121.3 },
  ],
  id: 7,
  nodes: [1, 2],
  tags: { name: 'Larsen' },
  type: 'way',
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('readOverpassElements', () => {
  it('returns the elements of a clean response', async () => {
    await expect(
      readOverpassElements(Response.json({ elements: [WAY] })),
    ).resolves.toEqual([WAY]);
  });

  it('treats a missing elements array as empty', async () => {
    await expect(readOverpassElements(Response.json({}))).resolves.toEqual([]);
  });

  it.each([
    TIMED_OUT,
    'runtime error: Query run out of memory using about 2048 MB of RAM.',
  ])('throws on a 200 that carries %j', async (remark) => {
    const read = readOverpassElements(
      Response.json({ elements: [WAY], remark }),
    );

    await expect(read).rejects.toBeInstanceOf(OverpassError);
    await expect(
      readOverpassElements(Response.json({ elements: [], remark })),
    ).rejects.toThrow(remark);
  });

  it('ignores a remark that is not a runtime error', async () => {
    await expect(
      readOverpassElements(
        Response.json({ elements: [WAY], remark: 'runtime remark: note' }),
      ),
    ).resolves.toEqual([WAY]);
  });
});

describe('fetchers', () => {
  it('fetchTrailNetwork rejects a timed-out query instead of returning no ways', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ elements: [], remark: TIMED_OUT })),
    );

    await expect(
      fetchTrailNetwork([-121.32, 44.04, -121.3, 44.06]),
    ).rejects.toBeInstanceOf(OverpassError);
  });

  it('fetchWaysByIds rejects a timed-out query instead of reporting ways missing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ elements: [], remark: TIMED_OUT })),
    );

    await expect(fetchWaysByIds([7])).rejects.toBeInstanceOf(OverpassError);
  });
});

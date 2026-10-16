import type { PayloadRequest } from 'payload';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchTrailNetwork } from '@/payload/osm/overpass';
import type { NetworkWay } from '@/payload/osm/trail-network';
import { clearTrailNetworkCache, trailNetwork } from './trail-network';

vi.mock('@/payload/osm/overpass', () => ({
  fetchTrailNetwork: vi.fn(),
  OverpassError: class OverpassError extends Error {},
}));

const WAYS: NetworkWay[] = [
  {
    coordinates: [
      [-121.35, 44.05],
      [-121.34, 44.05],
    ],
    id: 1,
    name: 'Test',
    nodes: [10, 11],
  },
];

const CELL = '-121.4,44,-121.3,44.1';

function request(
  bbox: string | null,
  role: string | null = 'admin',
): PayloadRequest {
  const searchParams = new URLSearchParams(bbox === null ? '' : { bbox });
  return {
    payload: { logger: { warn: vi.fn() } },
    searchParams,
    user: role ? { role } : null,
  } as unknown as PayloadRequest;
}

beforeEach(() => {
  vi.mocked(fetchTrailNetwork).mockResolvedValue(WAYS);
});

afterEach(() => {
  clearTrailNetworkCache();
  vi.clearAllMocks();
});

describe('trailNetwork', () => {
  it('requires a signed-in admin', async () => {
    expect((await trailNetwork(request(CELL, null))).status).toBe(401);
    expect((await trailNetwork(request(CELL, 'editor'))).status).toBe(403);
    expect(fetchTrailNetwork).not.toHaveBeenCalled();
  });

  it('rejects a missing, malformed, or oversized box', async () => {
    for (const bbox of [null, '1,2,3', 'a,b,c,d', '-121.4,44,-121.4,44.1']) {
      expect((await trailNetwork(request(bbox))).status).toBe(400);
    }
    // Wider than one grid cell: a zoomed-out view must not reach Overpass.
    expect((await trailNetwork(request('-122,44,-121,44.1'))).status).toBe(400);
    expect(fetchTrailNetwork).not.toHaveBeenCalled();
  });

  it('returns the ways in the box', async () => {
    const response = await trailNetwork(request(CELL));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ways: WAYS });
    expect(fetchTrailNetwork).toHaveBeenCalledWith([-121.4, 44, -121.3, 44.1]);
  });

  it('serves a repeat request from the cache', async () => {
    await trailNetwork(request(CELL));
    await trailNetwork(request(CELL));
    expect(fetchTrailNetwork).toHaveBeenCalledTimes(1);
  });

  it('shares one Overpass request between concurrent requests for a box', async () => {
    await Promise.all([
      trailNetwork(request(CELL)),
      trailNetwork(request(CELL)),
    ]);
    expect(fetchTrailNetwork).toHaveBeenCalledTimes(1);
  });

  it('reports an Overpass failure and does not cache it', async () => {
    vi.mocked(fetchTrailNetwork).mockRejectedValueOnce(new Error('busy'));
    expect((await trailNetwork(request(CELL))).status).toBe(502);
    expect((await trailNetwork(request(CELL))).status).toBe(200);
    expect(fetchTrailNetwork).toHaveBeenCalledTimes(2);
  });
});

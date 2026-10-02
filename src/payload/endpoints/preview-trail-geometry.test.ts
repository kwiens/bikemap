import type { PayloadRequest } from 'payload';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTrailFromOsm, type BuiltTrail } from '@/payload/osm/build';
import { previewTrailGeometry } from './preview-trail-geometry';

vi.mock('@/payload/osm/build', () => ({
  buildTrailFromOsm: vi.fn(),
}));

const BUILT = {
  bounds: [-121.4, 44, -121.3, 44.1] as [number, number, number, number],
  distance: 3.46,
  elevationGain: 100,
  elevationLoss: 573,
  elevationMax: 4636,
  elevationMin: 4068,
  geometry: {
    coordinates: [
      [
        [-121.4, 44],
        [-121.3, 44.1],
      ],
    ],
    type: 'MultiLineString' as const,
  },
  profile: null,
  report: {
    gaps: [],
    missingIds: [],
    resolvedIds: [290404136],
    warnings: [],
  },
} satisfies BuiltTrail;

beforeEach(() => {
  vi.mocked(buildTrailFromOsm).mockResolvedValue(BUILT);
  vi.clearAllMocks();
});

describe('previewTrailGeometry', () => {
  it('rejects anonymous requests', async () => {
    const { req } = request({ user: null });

    const response = await previewTrailGeometry(req);

    expect(response.status).toBe(401);
    expect(buildTrailFromOsm).not.toHaveBeenCalled();
  });

  it('returns a preview without writing a trail', async () => {
    const { req, update } = request();

    const response = await previewTrailGeometry(req);

    expect(buildTrailFromOsm).toHaveBeenCalledWith(
      [290404136],
      'Phil’s Trail',
      { mapboxToken: process.env.NEXT_PUBLIC_MAPBOX_TOKEN },
    );
    expect(update).not.toHaveBeenCalled();
    expect(await response.json()).toEqual({
      geometry: BUILT.geometry,
      measurements: {
        bounds: BUILT.bounds,
        distance: 3.46,
        elevationGain: 100,
        elevationLoss: 573,
        elevationMax: 4636,
        elevationMin: 4068,
      },
      message: 'Trail line preview refreshed. Save this trail to keep it.',
      profile: null,
      report: BUILT.report,
    });
  });

  it('rejects an empty selection before fetching OSM', async () => {
    const { req } = request({ body: { name: 'Trail', osmIds: [] } });

    const response = await previewTrailGeometry(req);

    expect(response.status).toBe(400);
    expect(buildTrailFromOsm).not.toHaveBeenCalled();
  });

  it('does not replace the form line when no selected way resolves', async () => {
    const { req } = request();
    vi.mocked(buildTrailFromOsm).mockResolvedValueOnce({
      ...BUILT,
      geometry: null,
      report: {
        ...BUILT.report,
        warnings: ['None of these OSM ways could be found.'],
      },
    });

    const response = await previewTrailGeometry(req);

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      message: 'None of these OSM ways could be found.',
    });
  });
});

function request({
  body = { name: 'Phil’s Trail', osmIds: [290404136] },
  user = { id: 1 },
}: {
  body?: Record<string, unknown>;
  user?: null | { id: number };
} = {}) {
  const update = vi.fn();
  const req = {
    json: vi.fn().mockResolvedValue(body),
    payload: {
      logger: { error: vi.fn() },
      update,
    },
    user,
  } as unknown as PayloadRequest;
  return { req, update };
}

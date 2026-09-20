import { revalidatePath } from 'next/cache';
import { APIError, type PayloadRequest } from 'payload';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ElevationProfile } from '@/data/mountain-bike-trails';
import { measureParts } from '@/payload/osm/measure';
import { getBundledElevationProfile } from '@/payload/read/bundled-elevation';
import { recalculateTrailElevation } from './recalculate-trail-elevation';

vi.mock('@/payload/osm/measure', () => ({
  measureParts: vi.fn(),
}));

vi.mock('@/payload/read/bundled-elevation', () => ({
  getBundledElevationProfile: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

const PROFILE: ElevationProfile = {
  distance: 5280,
  gain: 240,
  loss: 180,
  max: 1240,
  min: 1000,
  profile: [
    [0, 1000, -85.3, 35.1],
    [5280, 1240, -85.29, 35.11],
  ],
  trail: 'Test Trail',
};

const MEASURED = {
  bounds: [-85.3, 35.1, -85.29, 35.11] as [number, number, number, number],
  distance: 1,
  elevationGain: 240,
  elevationLoss: 180,
  elevationMax: 1240,
  elevationMin: 1000,
  profile: PROFILE,
  warnings: [],
};

const ORIGINAL_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

beforeEach(() => {
  process.env.NEXT_PUBLIC_MAPBOX_TOKEN = 'test-token';
  vi.mocked(measureParts).mockResolvedValue(MEASURED);
  vi.mocked(getBundledElevationProfile).mockResolvedValue(null);
});

afterEach(() => {
  if (ORIGINAL_TOKEN === undefined) {
    delete process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  } else {
    process.env.NEXT_PUBLIC_MAPBOX_TOKEN = ORIGINAL_TOKEN;
  }
  vi.clearAllMocks();
});

describe('recalculateTrailElevation', () => {
  it('rejects anonymous requests before reading the trail', async () => {
    const { req, findByID } = request({ user: null });

    const response = await recalculateTrailElevation(req);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      message: 'Sign in to update trail elevation.',
    });
    expect(findByID).not.toHaveBeenCalled();
  });

  it('measures the saved line and updates only derived fields', async () => {
    const { req, update } = request();

    const response = await recalculateTrailElevation(req);

    expect(response.status).toBe(200);
    expect(measureParts).toHaveBeenCalledWith(
      [
        [
          [-85.3, 35.1],
          [-85.29, 35.11],
        ],
      ],
      'Test Trail',
      { mapboxToken: 'test-token' },
    );
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'trails',
        context: { skipOsmRebuild: true },
        data: {
          bounds: MEASURED.bounds,
          distance: 1,
          elevationGain: 240,
          elevationLoss: 180,
          elevationMax: 1240,
          elevationMin: 1000,
          elevationProfile: PROFILE,
        },
        draft: false,
        id: '42',
        overrideAccess: false,
        overrideLock: false,
      }),
    );
    expect(revalidatePath).toHaveBeenCalledWith(
      '/api/map/elevation/test-trail',
    );
    expect(await response.json()).toEqual(
      expect.objectContaining({
        message: 'Elevation profile recalculated and saved.',
        measurements: expect.objectContaining({ elevationLoss: 180 }),
        profile: PROFILE,
        updatedAt: '2026-09-19T12:00:00.000Z',
      }),
    );
  });

  it('preserves a draft as a draft', async () => {
    const { req, update } = request({ status: 'draft' });

    await recalculateTrailElevation(req);

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ draft: true }),
    );
  });

  it('preserves Payload permission errors instead of reporting a server failure', async () => {
    const { req, findByID, update } = request();
    findByID.mockRejectedValueOnce(new APIError('Forbidden', 403, null, false));

    const response = await recalculateTrailElevation(req);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      message: 'You do not have permission to update this trail elevation.',
    });
    expect(update).not.toHaveBeenCalled();
  });

  it('does not report a successful database write as failed when cache invalidation fails', async () => {
    const { req, logger } = request();
    vi.mocked(revalidatePath).mockImplementationOnce(() => {
      throw new Error('cache unavailable');
    });

    const response = await recalculateTrailElevation(req);

    expect(response.status).toBe(200);
    expect(logger.warn).toHaveBeenCalledOnce();
  });

  it('repopulates a bundled profile when the trail has no saved geometry', async () => {
    const { req, findByID, update } = request();
    findByID.mockResolvedValueOnce({
      _status: 'published',
      city: 'chattanooga',
      displayName: 'Test Trail',
      geom: null,
      slug: 'test-trail',
      trailName: 'Test Trail',
    });
    vi.mocked(getBundledElevationProfile).mockResolvedValueOnce(PROFILE);

    const response = await recalculateTrailElevation(req);

    expect(response.status).toBe(200);
    expect(getBundledElevationProfile).toHaveBeenCalledWith(
      'chattanooga',
      'test-trail',
    );
    expect(measureParts).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          bounds: [-85.3, 35.1, -85.29, 35.11],
          distance: 1,
          elevationGain: 240,
          elevationLoss: 180,
          elevationMax: 1240,
          elevationMin: 1000,
          elevationProfile: PROFILE,
        },
      }),
    );
    expect(await response.json()).toEqual(
      expect.objectContaining({
        message: 'Bundled elevation profile repopulated and saved.',
        profile: PROFILE,
      }),
    );
  });

  it('does not write without saved geometry or a bundled profile', async () => {
    const { req, findByID, update } = request();
    findByID.mockResolvedValueOnce({
      _status: 'published',
      city: 'chattanooga',
      displayName: 'Test Trail',
      geom: null,
      slug: 'test-trail',
      trailName: 'Test Trail',
    });

    const response = await recalculateTrailElevation(req);

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      message:
        'This trail has no saved geometry or bundled elevation profile to restore.',
    });
    expect(measureParts).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('keeps the existing data when terrain sampling returns no profile', async () => {
    const { req, update } = request();
    vi.mocked(measureParts).mockResolvedValueOnce({
      ...MEASURED,
      elevationGain: null,
      elevationLoss: null,
      elevationMax: null,
      elevationMin: null,
      profile: null,
      warnings: ['No elevation data could be read.'],
    });

    const response = await recalculateTrailElevation(req);

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      message: 'No elevation data could be read.',
    });
    expect(update).not.toHaveBeenCalled();
  });
});

function request({
  status = 'published',
  user = { id: 1, role: 'admin' },
}: {
  status?: 'draft' | 'published';
  user?: null | { id: number; role: string };
} = {}) {
  const findByID = vi.fn().mockResolvedValue({
    _status: status,
    displayName: 'Test Trail',
    geom: {
      coordinates: [
        [
          [-85.3, 35.1],
          [-85.29, 35.11],
        ],
      ],
      type: 'MultiLineString',
    },
    slug: 'test-trail',
    trailName: 'Test Trail',
  });
  const update = vi.fn().mockResolvedValue({
    updatedAt: '2026-09-19T12:00:00.000Z',
  });
  const logger = { error: vi.fn(), warn: vi.fn() };
  const req = {
    payload: {
      findByID,
      logger,
      update,
    },
    routeParams: { id: '42' },
    user,
  } as unknown as PayloadRequest;

  return { findByID, logger, req, update };
}

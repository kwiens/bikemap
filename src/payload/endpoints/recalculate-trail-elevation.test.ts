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

const GEOMETRY = {
  coordinates: [
    [
      [-85.3, 35.1],
      [-85.29, 35.11],
    ],
  ],
  type: 'MultiLineString',
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
      message: 'Sign in to calculate trail elevation.',
    });
    expect(findByID).not.toHaveBeenCalled();
  });

  it('previews measurements without updating the trail', async () => {
    const { req, update } = request();

    const response = await recalculateTrailElevation(req);

    expect(response.status).toBe(200);
    expect(measureParts).toHaveBeenCalledWith(
      GEOMETRY.coordinates,
      'Preview name',
      { mapboxToken: 'test-token' },
    );
    expect(update).not.toHaveBeenCalled();
    expect(await response.json()).toEqual({
      measurements: {
        bounds: MEASURED.bounds,
        distance: 1,
        elevationGain: 240,
        elevationLoss: 180,
        elevationMax: 1240,
        elevationMin: 1000,
      },
      message: 'Elevation preview recalculated. Save this trail to keep it.',
      profile: PROFILE,
    });
  });

  it('uses unsaved geometry supplied by the form', async () => {
    const previewGeometry = {
      coordinates: [
        [
          [-85.4, 35.2],
          [-85.39, 35.21],
        ],
      ],
      type: 'MultiLineString',
    };
    const { req } = request({
      body: { geometry: previewGeometry, name: 'Unsaved line' },
    });

    await recalculateTrailElevation(req);

    expect(measureParts).toHaveBeenCalledWith(
      previewGeometry.coordinates,
      'Unsaved line',
      { mapboxToken: 'test-token' },
    );
  });

  it('preserves Payload permission errors as client errors', async () => {
    const { req, findByID } = request();
    findByID.mockRejectedValueOnce(new APIError('Forbidden', 403, null, false));

    const response = await recalculateTrailElevation(req);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      message: 'You do not have permission to read this trail.',
    });
  });

  it('previews a bundled profile when the trail has no CMS geometry', async () => {
    const { req, findByID, update } = request({ body: { geometry: null } });
    findByID.mockResolvedValueOnce({
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
    expect(update).not.toHaveBeenCalled();
    expect(await response.json()).toEqual(
      expect.objectContaining({
        message:
          'Bundled elevation profile preview is ready. Save this trail to keep it.',
        profile: PROFILE,
      }),
    );
  });

  it('does not produce a preview without geometry or a bundled profile', async () => {
    const { req, findByID, update } = request({ body: { geometry: null } });
    findByID.mockResolvedValueOnce({
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
        'This trail has no line or bundled elevation profile to preview.',
    });
    expect(update).not.toHaveBeenCalled();
  });

  it('rejects a preview when terrain sampling returns no profile', async () => {
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
  body = { geometry: GEOMETRY, name: 'Preview name' },
  user = { id: 1, role: 'admin' },
}: {
  body?: Record<string, unknown>;
  user?: null | { id: number; role: string };
} = {}) {
  const findByID = vi.fn().mockResolvedValue({
    city: 'chattanooga',
    displayName: 'Test Trail',
    geom: GEOMETRY,
    slug: 'test-trail',
    trailName: 'Test Trail',
  });
  const update = vi.fn();
  const logger = { error: vi.fn(), warn: vi.fn() };
  const req = {
    json: vi.fn().mockResolvedValue(body),
    payload: { findByID, logger, update },
    routeParams: { id: '42' },
    user,
  } as unknown as PayloadRequest;

  return { findByID, logger, req, update };
}

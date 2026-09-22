import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  find: vi.fn(),
  getPayload: vi.fn(),
  revalidateTag: vi.fn(),
  unstableCache: vi.fn((callback: (...args: unknown[]) => unknown) => callback),
}));

vi.mock('server-only', () => ({}));
vi.mock('@payload-config', () => ({ default: {} }));
vi.mock('payload', () => ({ getPayload: mocks.getPayload }));
vi.mock('next/cache', () => ({
  revalidateTag: mocks.revalidateTag,
  unstable_cache: mocks.unstableCache,
}));

const { getCityTrailGeojson, getCityTrailSummaries } = await import('./trails');

const originalDatabaseUrl = process.env.DATABASE_URL;

beforeEach(() => {
  process.env.DATABASE_URL = 'postgresql://test.invalid/database';
  mocks.find.mockReset();
  mocks.getPayload.mockReset();
  mocks.getPayload.mockResolvedValue({ find: mocks.find });
});

afterAll(() => {
  if (originalDatabaseUrl === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = originalDatabaseUrl;
  }
});

describe('getCityTrailSummaries', () => {
  it('selects only fields used by the public trail list', async () => {
    mocks.find.mockResolvedValue({
      docs: [
        {
          area: { name: "Phil's Trail Complex", region: 'Bend' },
          bounds: [-121.4, 44, -121.3, 44.1],
          displayName: "Phil's Trail",
          distance: 6.4,
          elevationGain: 300,
          elevationLoss: 290,
          elevationMax: 1450,
          elevationMin: 1210,
          kind: { color: null, icon: 'mountain', value: 'singletrack' },
          osmIds: [123],
          rating: { color: '#2563eb', value: 'intermediate' },
          slug: 'phils-trail',
          trailName: "Phil's Trail",
        },
      ],
    });

    const result = await getCityTrailSummaries('bend');
    const query = mocks.find.mock.calls[0][0];

    expect(query.select).toEqual({
      area: true,
      bounds: true,
      displayName: true,
      distance: true,
      elevationGain: true,
      elevationLoss: true,
      elevationMax: true,
      elevationMin: true,
      kind: true,
      osmIds: true,
      rating: true,
      slug: true,
      trailName: true,
    });
    expect(query.select).not.toHaveProperty('geom');
    expect(query.select).not.toHaveProperty('elevationProfile');
    expect(query.populate).toEqual({
      'trail-areas': { name: true, region: true },
      'trail-kinds': { color: true, icon: true, value: true },
      'trail-ratings': { color: true, value: true },
    });
    expect(result).toMatchObject({
      status: 'ok',
      trails: [
        {
          displayName: "Phil's Trail",
          rating: 'intermediate',
          recArea: "Phil's Trail Complex",
          region: 'Bend',
          trailName: "Phil's Trail",
        },
      ],
    });
  });

  it('keeps the checked-in fallback available when there is no database', async () => {
    delete process.env.DATABASE_URL;

    await expect(getCityTrailSummaries('bend')).resolves.toEqual({
      status: 'unavailable',
      trails: [],
    });
    expect(mocks.find).not.toHaveBeenCalled();
  });
});

describe('getCityTrailGeojson', () => {
  it('selects geometry without transferring sidebar or elevation fields', async () => {
    const geometry = {
      coordinates: [
        [-121.4, 44],
        [-121.3, 44.1],
      ],
      type: 'LineString',
    };
    mocks.find.mockResolvedValue({
      docs: [
        {
          geom: geometry,
          osmIds: [123],
          slug: 'phils-trail',
          trailName: "Phil's Trail",
        },
      ],
    });

    const result = await getCityTrailGeojson('bend');
    const query = mocks.find.mock.calls[0][0];

    expect(query.depth).toBe(0);
    expect(query.select).toEqual({
      geom: true,
      osmIds: true,
      slug: true,
      trailName: true,
    });
    expect(query.select).not.toHaveProperty('elevationProfile');
    expect(result).toEqual({
      geojson: {
        features: [
          {
            geometry,
            properties: {
              osmIds: [123],
              slug: 'phils-trail',
              Trail: "Phil's Trail",
            },
            type: 'Feature',
          },
        ],
        type: 'FeatureCollection',
      },
      status: 'ok',
    });
  });
});

import { describe, expect, it, vi } from 'vitest';
import { ValidationError } from 'payload';
import { appendWaypoint, EMPTY_PLAN } from '@/payload/routing/plan';
import { resolveRouteSource } from './resolveRouteSource';

type HookArgs = Parameters<typeof resolveRouteSource>[0];

const GEOMETRY = {
  coordinates: [
    [
      [-121.4, 44],
      [-121.39, 44.01],
    ],
  ],
  type: 'MultiLineString',
};

interface TrailFixture {
  _status: string;
  city: string;
  displayName: string;
  geom: unknown;
  id: number;
  slug: string;
  trailName: string;
}

function run(
  data: Record<string, unknown>,
  trail: TrailFixture = {
    city: 'bend',
    displayName: 'Deschutes River Trail',
    geom: GEOMETRY,
    id: 42,
    slug: 'deschutes-river-trail',
    trailName: 'Deschutes River Trail',
    _status: 'published',
  },
  existingRoutes: { id: number; routeId: string }[] = [],
) {
  const findByID = vi.fn().mockResolvedValue(trail);
  const find = vi.fn().mockResolvedValue({ docs: existingRoutes });
  const result = resolveRouteSource({
    collection: { slug: 'routes' },
    context: {},
    data,
    operation: 'create',
    req: { payload: { find, findByID } },
  } as unknown as HookArgs);
  return { find, findByID, result: Promise.resolve(result) };
}

describe('resolveRouteSource', () => {
  it('derives a new trail-backed route name, id, and kind', async () => {
    const { findByID, result } = run({
      _status: 'published',
      city: 'bend',
      geometrySource: 'trail',
      sourceTrail: 42,
    });

    await expect(result).resolves.toEqual(
      expect.objectContaining({
        kind: 'trail',
        name: 'Deschutes River Trail',
        routeId: 'deschutes-river-trail',
      }),
    );
    expect(findByID).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'trails', id: 42 }),
    );
  });

  it('rejects a linked trail from another city', async () => {
    const { result } = run(
      {
        _status: 'published',
        city: 'chattanooga',
        geometrySource: 'trail',
        sourceTrail: 42,
      },
      {
        city: 'bend',
        displayName: 'Deschutes River Trail',
        geom: GEOMETRY,
        id: 42,
        slug: 'deschutes-river-trail',
        trailName: 'Deschutes River Trail',
        _status: 'published',
      },
    );
    const failed = await result.catch(
      (error: unknown) => error as ValidationError,
    );
    expect(failed).toBeInstanceOf(ValidationError);
    expect((failed as ValidationError).data.errors[0]).toEqual(
      expect.objectContaining({ path: 'sourceTrail' }),
    );
  });

  it('rejects a linked trail without drawable geometry', async () => {
    const { result } = run(
      {
        _status: 'published',
        city: 'bend',
        geometrySource: 'trail',
        sourceTrail: 42,
      },
      {
        city: 'bend',
        displayName: 'Deschutes River Trail',
        geom: null,
        id: 42,
        slug: 'deschutes-river-trail',
        trailName: 'Deschutes River Trail',
        _status: 'published',
      },
    );
    const failed = await result.catch(
      (error: unknown) => error as ValidationError,
    );
    expect(failed).toBeInstanceOf(ValidationError);
    expect((failed as ValidationError).data.errors[0]).toEqual(
      expect.objectContaining({ path: 'sourceTrail' }),
    );
  });

  it('accepts an explicit Studio layer without database geometry', async () => {
    const { findByID, result } = run({
      _status: 'published',
      city: 'chattanooga',
      geometrySource: 'studio',
      name: 'Zoo Loop',
      routeId: 'zoo-loop-v2-full-public',
    });

    await expect(result).resolves.toEqual(
      expect.objectContaining({
        geometrySource: 'studio',
        sourceTrail: null,
      }),
    );
    expect(findByID).not.toHaveBeenCalled();
  });

  it('rejects a Studio layer that the city style does not own', async () => {
    const { result } = run({
      _status: 'published',
      city: 'bend',
      geometrySource: 'studio',
      name: 'Missing layer',
      routeId: 'not-a-layer',
    });
    const failed = await result.catch(
      (error: unknown) => error as ValidationError,
    );

    expect(failed).toBeInstanceOf(ValidationError);
    expect((failed as ValidationError).data.errors[0]).toEqual(
      expect.objectContaining({ path: 'routeId' }),
    );
  });

  it('requires geometry and provenance for a published imported route', async () => {
    const { result } = run({
      _status: 'published',
      city: 'bend',
      geometrySource: 'imported',
      name: 'Imported route',
      routeId: 'imported-route',
    });
    const failed = await result.catch(
      (error: unknown) => error as ValidationError,
    );
    expect(failed).toBeInstanceOf(ValidationError);
    expect((failed as ValidationError).data.errors[0]).toEqual(
      expect.objectContaining({ path: 'geom' }),
    );
  });

  describe('built on the map', () => {
    const plan = appendWaypoint(
      appendWaypoint(EMPTY_PLAN, [-121.4, 44]).plan,
      [-121.39, 44.01],
    ).plan;

    it('derives the line, distance, bounds, and id from the plan', async () => {
      const { result } = run({
        _status: 'published',
        bounds: [0, 0, 1, 1],
        city: 'bend',
        distance: 99,
        geom: null,
        geometrySource: 'composed',
        name: 'Old Mill Loop',
        plan,
        sourceTrail: 42,
      });
      const resolved = (await result) as Record<string, unknown>;

      expect(resolved.geom).toEqual(GEOMETRY);
      expect(resolved.distance).toBeCloseTo(0.85, 1);
      expect(resolved.bounds).toEqual([-121.4, 44, -121.39, 44.01]);
      expect(resolved.routeId).toBe('old-mill-loop');
      expect(resolved.sourceTrail).toBeNull();
    });

    it('picks a free id when another route already uses the name', async () => {
      const { result } = run(
        {
          _status: 'draft',
          city: 'bend',
          geometrySource: 'composed',
          name: 'Old Mill Loop',
          plan,
        },
        undefined,
        [
          { id: 1, routeId: 'old-mill-loop' },
          { id: 2, routeId: 'old-mill-loop-2' },
        ],
      );
      const resolved = (await result) as Record<string, unknown>;

      expect(resolved.routeId).toBe('old-mill-loop-3');
    });

    it('lets a draft be saved before it has a line', async () => {
      const { result } = run({
        _status: 'draft',
        city: 'bend',
        geometrySource: 'composed',
        plan: null,
      });
      const resolved = (await result) as Record<string, unknown>;

      expect(resolved.geom).toBeNull();
      expect(resolved.distance).toBeNull();
    });

    it.each([
      [{ name: 'No line', plan: null }, 'plan'],
      [{ plan }, 'name'],
      [{ name: 'Bad', plan: { ...plan, legs: [] } }, 'plan'],
    ])('refuses to publish %o', async (data, path) => {
      const { result } = run({
        _status: 'published',
        city: 'bend',
        geometrySource: 'composed',
        ...data,
      });
      const failed = await result.catch(
        (error: unknown) => error as ValidationError,
      );
      expect(failed).toBeInstanceOf(ValidationError);
      expect((failed as ValidationError).data.errors[0]).toEqual(
        expect.objectContaining({ path }),
      );
    });
  });
});

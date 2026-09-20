import { describe, expect, it, vi } from 'vitest';
import { ValidationError } from 'payload';
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
) {
  const findByID = vi.fn().mockResolvedValue(trail);
  const result = resolveRouteSource({
    collection: { slug: 'routes' },
    context: {},
    data,
    operation: 'create',
    req: { payload: { findByID } },
  } as unknown as HookArgs);
  return { findByID, result: Promise.resolve(result) };
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
});

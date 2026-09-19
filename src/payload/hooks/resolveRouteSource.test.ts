import { describe, expect, it, vi } from 'vitest';
import { ValidationError } from 'payload';
import { resolveRouteSource } from './resolveRouteSource';

type HookArgs = Parameters<typeof resolveRouteSource>[0];

function run(
  data: Record<string, unknown>,
  trail = {
    city: 'bend',
    displayName: 'Deschutes River Trail',
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

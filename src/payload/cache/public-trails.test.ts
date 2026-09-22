import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  revalidateTag: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidateTag: mocks.revalidateTag }));

const {
  invalidatePublicTrailDataAfterChange,
  invalidatePublicTrailDataAfterDelete,
  invalidatePublicTrailSummariesAfterChange,
  invalidatePublicTrailSummariesAfterDelete,
  PUBLIC_TRAIL_GEOJSON_CACHE_TAG,
  PUBLIC_TRAIL_SUMMARIES_CACHE_TAG,
} = await import('./public-trails');

function hookArguments() {
  return {
    doc: { id: 1 },
    req: {
      payload: {
        logger: { warn: vi.fn() },
      },
    },
  };
}

beforeEach(() => {
  mocks.revalidateTag.mockReset();
});

describe('public trail cache hooks', () => {
  it('expires summaries and geometry after a trail write or delete', () => {
    const change = hookArguments();
    const deletion = hookArguments();

    invalidatePublicTrailDataAfterChange(change as never);
    invalidatePublicTrailDataAfterDelete(deletion as never);

    expect(mocks.revalidateTag.mock.calls).toEqual([
      [PUBLIC_TRAIL_SUMMARIES_CACHE_TAG, 'max'],
      [PUBLIC_TRAIL_GEOJSON_CACHE_TAG, 'max'],
      [PUBLIC_TRAIL_SUMMARIES_CACHE_TAG, 'max'],
      [PUBLIC_TRAIL_GEOJSON_CACHE_TAG, 'max'],
    ]);
  });

  it('expires only summaries after vocabulary changes', () => {
    const change = hookArguments();
    const deletion = hookArguments();

    invalidatePublicTrailSummariesAfterChange(change as never);
    invalidatePublicTrailSummariesAfterDelete(deletion as never);

    expect(mocks.revalidateTag.mock.calls).toEqual([
      [PUBLIC_TRAIL_SUMMARIES_CACHE_TAG, 'max'],
      [PUBLIC_TRAIL_SUMMARIES_CACHE_TAG, 'max'],
    ]);
  });

  it('does not fail a content write when invalidation has no Next context', () => {
    const args = hookArguments();
    mocks.revalidateTag.mockImplementationOnce(() => {
      throw new Error('missing Next request context');
    });

    expect(invalidatePublicTrailDataAfterChange(args as never)).toBe(args.doc);
    expect(args.req.payload.logger.warn).toHaveBeenCalledOnce();
  });
});

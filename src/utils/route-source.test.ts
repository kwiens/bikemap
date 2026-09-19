import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchRouteCollection, routeIdsInCollection } from './route-source';

describe('route source', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('returns a non-empty FeatureCollection and indexes its route ids', async () => {
    const collection = {
      type: 'FeatureCollection' as const,
      features: [
        {
          type: 'Feature' as const,
          properties: { id: 'riverwalk-loop-v3-public' },
          geometry: null,
        },
      ],
    };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => collection,
      }),
    );

    const result = await fetchRouteCollection(
      '/api/map/routes?city=chattanooga',
    );

    expect(result).toEqual(collection);
    expect(routeIdsInCollection(result)).toEqual(
      new Set(['riverwalk-loop-v3-public']),
    );
  });

  it('treats an unavailable or unseeded database as a miss', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({ ok: false, status: 503 })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ type: 'FeatureCollection', features: [] }),
        }),
    );

    await expect(fetchRouteCollection('/unavailable')).resolves.toBeNull();
    await expect(fetchRouteCollection('/empty')).resolves.toBeNull();
  });

  it('bounds how long a slow database can delay the Studio fallback', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: RequestInfo | URL, init?: RequestInit) => {
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        });
      }),
    );

    const result = fetchRouteCollection('/slow', undefined, 25);
    await vi.advanceTimersByTimeAsync(25);

    await expect(result).resolves.toBeNull();
  });
});

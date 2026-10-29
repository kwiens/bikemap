import type { PayloadRequest } from 'payload';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createNetworkEndpoint } from './network-endpoint';

function request(
  cell = '0',
  role: string | null = 'admin',
  signal?: AbortSignal,
) {
  return {
    payload: { logger: { warn: vi.fn() } },
    searchParams: new URLSearchParams({ cell }),
    signal,
    user: role ? { role } : null,
  } as unknown as PayloadRequest;
}

function endpoint() {
  const fetchWays = vi.fn(async () => [{ id: 1 }]);
  return {
    fetchWays,
    ...createNetworkEndpoint({
      fetchWays,
      invalidMessage: 'Invalid cell',
      label: 'Test network',
      maxCachedCells: 2,
      parseBounds(params) {
        const cell = Number(params.get('cell'));
        return Number.isFinite(cell) ? [cell, 0, cell + 1, 1] : null;
      },
    }),
  };
}

afterEach(() => vi.useRealTimers());

describe('network endpoint caching', () => {
  it('checks role and bounds before fetching', async () => {
    const { handler, fetchWays } = endpoint();
    expect((await handler(request('0', null))).status).toBe(401);
    expect((await handler(request('0', 'editor'))).status).toBe(403);
    expect((await handler(request('invalid'))).status).toBe(400);
    expect(fetchWays).not.toHaveBeenCalled();
  });

  it('shares a pending fetch even when its first caller aborts', async () => {
    const { handler, fetchWays } = endpoint();
    let resolve = (_value: { id: number }[]) => {};
    fetchWays.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const controller = new AbortController();
    const first = handler(request('0', 'admin', controller.signal));
    const second = handler(request('0'));
    controller.abort();
    resolve([{ id: 2 }]);
    const responses = await Promise.all([first, second]);
    for (const response of responses) {
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ways: [{ id: 2 }] });
      expect(response.headers.get('cache-control')).toBe(
        'private, max-age=3600',
      );
    }
    expect(fetchWays).toHaveBeenCalledExactlyOnceWith([0, 0, 1, 1]);
  });

  it('expires cached cells after six hours', async () => {
    vi.useFakeTimers();
    const { handler, fetchWays } = endpoint();
    await handler(request());
    vi.advanceTimersByTime(6 * 60 * 60 * 1000 - 1);
    await handler(request());
    expect(fetchWays).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    await handler(request());
    expect(fetchWays).toHaveBeenCalledTimes(2);
  });

  it('evicts the oldest cell at capacity', async () => {
    const { handler, fetchWays } = endpoint();
    await handler(request('0'));
    await handler(request('1'));
    await handler(request('2'));
    await handler(request('1'));
    expect(fetchWays).toHaveBeenCalledTimes(3);
    await handler(request('0'));
    expect(fetchWays).toHaveBeenCalledTimes(4);
  });

  it('lets all callers retry after a shared failure', async () => {
    const { handler, fetchWays } = endpoint();
    fetchWays.mockRejectedValueOnce(new Error('busy'));
    const responses = await Promise.all([
      handler(request()),
      handler(request()),
    ]);
    expect(responses.map((response) => response.status)).toEqual([502, 502]);
    expect(fetchWays).toHaveBeenCalledTimes(1);
    expect((await handler(request())).status).toBe(200);
    expect(fetchWays).toHaveBeenCalledTimes(2);
  });
});

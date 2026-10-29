import type { PayloadRequest } from 'payload';
import { describe, expect, it, vi } from 'vitest';
import { fetchRouteNetwork } from '@/payload/routing/fetch-network';
import { cellBounds } from '@/payload/routing/cells';
import { routeNetwork } from './route-network';

vi.mock('@/payload/routing/fetch-network', () => ({
  fetchRouteNetwork: vi.fn().mockResolvedValue([]),
}));

function request(cell: string): PayloadRequest {
  return {
    payload: { logger: { warn: vi.fn() } },
    searchParams: new URLSearchParams({ cell }),
    user: { role: 'admin' },
  } as unknown as PayloadRequest;
}

describe('route network cells', () => {
  it('validates cell indexes and shares the converted bounds across callers', async () => {
    expect((await routeNetwork(request('invalid'))).status).toBe(400);
    expect(fetchRouteNetwork).not.toHaveBeenCalled();
    const cell = '-3035,1100';
    const responses = await Promise.all([
      routeNetwork(request(cell)),
      routeNetwork(request(cell)),
    ]);
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect(fetchRouteNetwork).toHaveBeenCalledExactlyOnceWith(cellBounds(cell));
  });
});

import type mapboxgl from 'mapbox-gl';
import { describe, expect, it, vi } from 'vitest';
import type { NetworkWay } from '@/payload/osm/trail-network';
import { createRouteTool, type RouteStatus } from './route-tool';

function mapForView() {
  const handlers = new Map<string, () => void>();
  let bounds = [0.01, 0.01, 0.19, 0.09];
  const map = {
    getBounds: () => ({
      getEast: () => bounds[2],
      getNorth: () => bounds[3],
      getSouth: () => bounds[1],
      getWest: () => bounds[0],
    }),
    getCanvas: () => ({ style: {} }),
    getZoom: () => 13,
    on: (event: string, handler: () => void) => handlers.set(event, handler),
  } as unknown as mapboxgl.Map;
  return {
    map,
    moveTo(next: number[]) {
      bounds = next;
      handlers.get('moveend')?.();
    },
  };
}

describe('Follow trails network loading', () => {
  it('drops queued cells outside the view after a pan', async () => {
    const view = mapForView();
    let finishFirst: ((ways: NetworkWay[]) => void) | undefined;
    const first = new Promise<NetworkWay[]>((resolve) => {
      finishFirst = resolve;
    });
    const fetchNetwork = vi
      .fn<(bbox: [number, number, number, number]) => Promise<NetworkWay[]>>()
      .mockReturnValueOnce(first)
      .mockResolvedValue([]);
    const tool = createRouteTool(view.map, {
      apply: vi.fn(),
      fetchNetwork,
      getParts: () => [],
      isActive: () => true,
      onStatus: vi.fn(),
    });

    tool.activate();
    view.moveTo([0.21, 0.01, 0.29, 0.09]);
    finishFirst?.([]);

    await vi.waitFor(() => expect(fetchNetwork).toHaveBeenCalledTimes(2));
    expect(fetchNetwork.mock.calls.map(([bbox]) => bbox[0])).toEqual([0, 0.2]);
  });

  it('keeps an error visible when another cell succeeds', async () => {
    const view = mapForView();
    const statuses: RouteStatus[] = [];
    const fetchNetwork = vi
      .fn<(bbox: [number, number, number, number]) => Promise<NetworkWay[]>>()
      .mockRejectedValueOnce(new Error('Overpass is busy'))
      .mockResolvedValue([]);
    const tool = createRouteTool(view.map, {
      apply: vi.fn(),
      fetchNetwork,
      getParts: () => [],
      isActive: () => true,
      onStatus: (status) => statuses.push(status),
    });

    tool.activate();

    await vi.waitFor(() => expect(fetchNetwork).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(statuses.at(-1)?.network).toBe('error'));
    expect(statuses.at(-1)?.networkMessage).toContain('Retrying');
  });
});

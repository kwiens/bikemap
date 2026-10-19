import type mapboxgl from 'mapbox-gl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NetworkWay } from '@/payload/osm/trail-network';
import { createRouteTool, type RouteStatus } from './route-tool';

type Handler = (event?: unknown) => void;

function mapForView() {
  const handlers = new Map<string, Handler>();
  let bounds = [0.01, 0.01, 0.19, 0.09];
  const map = {
    getBounds: () => ({
      getEast: () => bounds[2],
      getNorth: () => bounds[3],
      getSouth: () => bounds[1],
      getWest: () => bounds[0],
    }),
    getCanvas: () => ({ style: {} }),
    getSource: () => undefined,
    getZoom: () => 13,
    off: (event: string, handler: Handler) => {
      if (handlers.get(event) === handler) {
        handlers.delete(event);
      }
    },
    on: (event: string, handler: Handler) => handlers.set(event, handler),
    // Only consulted for the ends of existing pieces, of which there are none.
    project: () => ({ dist: () => Infinity }),
  } as unknown as mapboxgl.Map;
  let clicks = 0;
  return {
    /** A click at a position; screen points are spaced apart so none reads as a double-click. */
    click(lng: number, lat: number, isAlt = false) {
      clicks += 1;
      const x = clicks * 100;
      handlers.get('click')?.({
        lngLat: { lat, lng },
        originalEvent: { altKey: isAlt },
        point: {
          dist: (other: { x: number; y: number }) =>
            Math.hypot(x - other.x, -other.y),
          x,
          y: 0,
        },
      });
    },
    map,
    moveTo(next: number[]) {
      bounds = next;
      handlers.get('moveend')?.();
    },
  };
}

/** An L-shaped trail: east along 0.05° N, north up 0.04° E, then east again. */
const ELBOW: NetworkWay = {
  coordinates: [
    [0.02, 0.05],
    [0.04, 0.05],
    [0.04, 0.07],
    [0.06, 0.07],
  ],
  id: 1,
  name: 'Elbow',
  nodes: [1, 2, 3, 4],
};

beforeEach(() => {
  // The tool draws through animation frames, which Node does not have.
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

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

describe('Follow trails teardown', () => {
  it('stops retrying failed cells once disposed', async () => {
    vi.useFakeTimers();
    const view = mapForView();
    const fetchNetwork = vi
      .fn<(bbox: [number, number, number, number]) => Promise<NetworkWay[]>>()
      .mockRejectedValue(new Error('Overpass is busy'));
    const tool = createRouteTool(view.map, {
      apply: vi.fn(),
      fetchNetwork,
      getParts: () => [],
      isActive: () => true,
      onStatus: vi.fn(),
    });

    tool.activate();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchNetwork).toHaveBeenCalledTimes(2);
    // Still alive, a failed cell is asked for again.
    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetchNetwork).toHaveBeenCalledTimes(4);

    tool.dispose();
    await vi.advanceTimersByTimeAsync(120_000);
    view.moveTo([0.21, 0.01, 0.29, 0.09]);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchNetwork).toHaveBeenCalledTimes(4);
  });
});

describe('Follow trails legs', () => {
  async function routeOnElbow() {
    const view = mapForView();
    const statuses: RouteStatus[] = [];
    const apply = vi.fn();
    const tool = createRouteTool(view.map, {
      apply,
      fetchNetwork: async () => [ELBOW],
      getParts: () => [],
      isActive: () => true,
      onStatus: (status) => statuses.push(status),
    });
    tool.activate();
    await vi.waitFor(() => expect(statuses.at(-1)?.network).toBe('ready'));
    return { apply, statuses, tool, view };
  }

  it('follows the trail on the leg after an Alt click', async () => {
    const { apply, statuses, tool, view } = await routeOnElbow();

    view.click(0.02, 0.05);
    // About 55 m north of the trail: within snapping range, but free.
    view.click(0.03, 0.0505, true);
    expect(statuses.at(-1)?.note).toBeNull();
    view.click(0.05, 0.07);
    tool.finish();

    const [path] = apply.mock.calls[0][0] as [number, number][][];
    // Straight to the free click, then back onto the trail and round the elbow.
    expect(path.slice(0, 2)).toEqual([
      [0.02, 0.05],
      [0.03, 0.0505],
    ]);
    expect(path).toContainEqual([0.04, 0.05]);
    expect(path).toContainEqual([0.04, 0.07]);
    expect(path.at(-1)?.[0]).toBeCloseTo(0.05, 9);
    expect(path.at(-1)?.[1]).toBeCloseTo(0.07, 9);
  });

  it('explains a straight leg to a click away from every trail', async () => {
    const { statuses, view } = await routeOnElbow();

    view.click(0.02, 0.05);
    view.click(0.03, 0.08);

    expect(statuses.at(-1)?.note).toMatch(/straight line/);
  });
});

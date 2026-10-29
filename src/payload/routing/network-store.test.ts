import { describe, expect, it, vi } from 'vitest';
import { type CellKey, cellsCovering, MAX_LEG_CELLS } from './cells';
import type { NetworkWay, Position } from './graph';
import { cellsForLeg, RouteNetworkStore } from './network-store';

const at = (east: number, north: number): Position => [
  -121.3 + east * 0.001,
  44.05 + north * 0.001,
];

it('stops enumerating cells once a leg exceeds the routing limit', () => {
  const keys = cellsForLeg([-170, -80], [170, 80]);

  expect(keys).toHaveLength(MAX_LEG_CELLS + 1);
});

function street(id: number, from: Position, to: Position): NetworkWay {
  return {
    class: 'street',
    coordinates: [from, to],
    hasBikeLane: false,
    id,
    name: null,
    nodes: [id * 10, id * 10 + 1],
  };
}

/** A fetch whose calls resolve only when the test says so. */
function deferredFetch() {
  const calls: {
    key: CellKey;
    resolve: (ways: NetworkWay[]) => void;
    reject: (error: Error) => void;
  }[] = [];
  const fetchCell = vi.fn(
    (key: CellKey) =>
      new Promise<NetworkWay[]>((resolve, reject) => {
        calls.push({ key, reject, resolve });
      }),
  );
  return { calls, fetchCell };
}

const flush = () =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

describe('RouteNetworkStore', () => {
  it('fetches each cell once, two at a time', async () => {
    const { calls, fetchCell } = deferredFetch();
    const store = new RouteNetworkStore(fetchCell);
    const keys: CellKey[] = ['1,1', '1,2', '1,3'];

    const first = store.ensure(keys);
    const again = store.ensure(['1,1']);
    await flush();
    expect(fetchCell).toHaveBeenCalledTimes(2);

    calls[0].resolve([]);
    await flush();
    expect(fetchCell).toHaveBeenCalledTimes(3);

    calls[1].resolve([]);
    calls[2].resolve([]);
    await Promise.all([first, again]);
    expect(keys.every((key) => store.isLoaded(key))).toBe(true);
    expect(store.pending).toBe(0);
  });

  it('retries a cell that failed', async () => {
    const fetchCell = vi
      .fn<(key: CellKey) => Promise<NetworkWay[]>>()
      .mockRejectedValueOnce(new Error('Overpass is busy'))
      .mockResolvedValueOnce([]);
    const store = new RouteNetworkStore(fetchCell);

    await expect(store.ensure(['1,1'])).rejects.toThrow('Overpass is busy');
    expect(store.isLoaded('1,1')).toBe(false);
    await store.ensure(['1,1']);
    expect(store.isLoaded('1,1')).toBe(true);
  });

  it('builds a graph over the requested cells with the trails touching them', async () => {
    const [here] = cellsCovering([...at(0, 0), ...at(0, 0)]);
    const store = new RouteNetworkStore(async () => [
      street(1, at(0, 0), at(1, 0)),
    ]);
    store.setTrails([
      { name: 'Near', parts: [[at(0, 1), at(0, 2)]], slug: 'near' },
      { name: 'Far', parts: [[at(500, 500), at(501, 500)]], slug: 'far' },
    ]);
    await store.ensure([here]);

    const graph = store.graphFor([here]);
    const names = graph.sources.map((source) =>
      'name' in source ? source.name : null,
    );
    expect(names).toEqual([null, 'Near']);
    expect(store.graphFor([here])).toBe(graph);
  });

  it('drops a cached graph when a cell it covers loads', async () => {
    const store = new RouteNetworkStore(async () => [
      street(1, at(0, 0), at(1, 0)),
    ]);
    const keys = cellsForLeg(at(0, 0), at(1, 0));
    const before = store.graphFor(keys);
    await store.ensure(keys);

    expect(store.graphFor(keys)).not.toBe(before);
    expect(store.graphFor(keys).segments).toHaveLength(1);
  });
});

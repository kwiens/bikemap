/**
 * The route editor's view of the network: which grid cells are loaded, the
 * ways in them, and graphs built over them.
 *
 * Kept out of React so it can be tested, and so loading never causes a render
 * the component didn't ask for.
 *
 * Client-safe.
 */
import { boundsOf } from '@/payload/osm/assemble';
import {
  type CellKey,
  cellBounds,
  cellsCovering,
  LEG_MARGIN_DEG,
  MAX_LEG_CELLS,
} from './cells';
import {
  buildRouteGraph,
  type CuratedTrail,
  type NetworkWay,
  type Position,
  type RouteGraph,
} from './graph';

export type FetchCell = (key: CellKey) => Promise<NetworkWay[]>;

/**
 * Overpass allows two concurrent requests per client and the server proxies
 * them, so more than this queues at Overpass instead of here.
 */
const MAX_CONCURRENT_FETCHES = 2;

/** Graphs kept for reuse, keyed by the cells they cover. */
const MAX_CACHED_GRAPHS = 4;

interface TrailEntry {
  bounds: [number, number, number, number];
  trail: CuratedTrail;
}

export class RouteNetworkStore {
  private readonly cells = new Map<CellKey, NetworkWay[]>();
  private readonly inflight = new Map<CellKey, Promise<void>>();
  private readonly graphs = new Map<string, RouteGraph>();
  private trails: TrailEntry[] = [];
  private queue: (() => void)[] = [];
  private running = 0;

  constructor(
    private readonly fetchCell: FetchCell,
    private readonly onChange: () => void = () => {},
  ) {}

  setTrails(trails: CuratedTrail[]): void {
    this.trails = trails.flatMap((trail) => {
      const bounds = boundsOf(trail.parts);
      return bounds ? [{ bounds, trail }] : [];
    });
    this.graphs.clear();
    this.onChange();
  }

  isLoaded(key: CellKey): boolean {
    return this.cells.has(key);
  }

  get pending(): number {
    return this.inflight.size;
  }

  /** Every loaded way, once each, for drawing. */
  allWays(): NetworkWay[] {
    const seen = new Map<number, NetworkWay>();
    for (const ways of this.cells.values()) {
      for (const way of ways) {
        seen.set(way.id, way);
      }
    }
    return [...seen.values()];
  }

  /**
   * Loads the given cells, resolving once all of them have settled. A cell
   * that fails is left unloaded so a later call retries it; the failure is
   * rethrown for the caller to report.
   */
  async ensure(keys: CellKey[]): Promise<void> {
    const results = await Promise.allSettled(keys.map((key) => this.load(key)));
    const failed = results.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    if (failed) {
      throw failed.reason;
    }
  }

  /**
   * A graph over the given cells, with every curated trail that touches them.
   *
   * Built over a bounded patch rather than everything loaded, so routing work
   * stays proportional to one leg however far the editor has panned.
   */
  graphFor(keys: CellKey[]): RouteGraph {
    const sorted = [...new Set(keys)].sort();
    const cacheKey = sorted.join(';');
    const cached = this.graphs.get(cacheKey);
    if (cached) {
      return cached;
    }

    const ways = new Map<number, NetworkWay>();
    const area = areaOf(sorted);
    for (const key of sorted) {
      for (const way of this.cells.get(key) ?? []) {
        ways.set(way.id, way);
      }
    }
    const trails = area
      ? this.trails
          .filter(({ bounds }) => intersects(bounds, area))
          .map(({ trail }) => trail)
      : [];

    const graph = buildRouteGraph({ trails, ways: [...ways.values()] });
    this.graphs.set(cacheKey, graph);
    while (this.graphs.size > MAX_CACHED_GRAPHS) {
      this.graphs.delete(this.graphs.keys().next().value as string);
    }
    return graph;
  }

  private load(key: CellKey): Promise<void> {
    if (this.cells.has(key)) {
      return Promise.resolve();
    }
    const existing = this.inflight.get(key);
    if (existing) {
      return existing;
    }
    const promise = this.schedule(() => this.fetchCell(key))
      .then((ways) => {
        this.cells.set(key, ways);
        // Any cached graph over this cell was built without it.
        for (const cacheKey of [...this.graphs.keys()]) {
          if (cacheKey.split(';').includes(key)) {
            this.graphs.delete(cacheKey);
          }
        }
      })
      .finally(() => {
        this.inflight.delete(key);
        this.onChange();
      });
    this.inflight.set(key, promise);
    this.onChange();
    return promise;
  }

  private schedule<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const run = () => {
        this.running++;
        task()
          .then(resolve, reject)
          .finally(() => {
            this.running--;
            this.queue.shift()?.();
          });
      };
      if (this.running < MAX_CONCURRENT_FETCHES) {
        run();
      } else {
        this.queue.push(run);
      }
    });
  }
}

/** The cells a leg between two points needs, with a margin for detours. */
export function cellsForLeg(from: Position, to: Position): CellKey[] {
  const margin = LEG_MARGIN_DEG;
  return cellsCovering(
    [
      Math.min(from[0], to[0]) - margin,
      Math.min(from[1], to[1]) - margin,
      Math.max(from[0], to[0]) + margin,
      Math.max(from[1], to[1]) + margin,
    ],
    MAX_LEG_CELLS + 1,
  );
}

/** The cells around one point — enough to snap a click. */
export function cellsAround(point: Position): CellKey[] {
  return cellsForLeg(point, point);
}

function areaOf(keys: string[]): [number, number, number, number] | null {
  let area: [number, number, number, number] | null = null;
  for (const key of keys) {
    const bounds = cellBounds(key);
    if (!bounds) {
      continue;
    }
    area = area
      ? [
          Math.min(area[0], bounds[0]),
          Math.min(area[1], bounds[1]),
          Math.max(area[2], bounds[2]),
          Math.max(area[3], bounds[3]),
        ]
      : bounds;
  }
  return area;
}

function intersects(
  a: [number, number, number, number],
  b: [number, number, number, number],
): boolean {
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}

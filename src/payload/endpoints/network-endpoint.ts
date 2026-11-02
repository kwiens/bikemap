import type { PayloadHandler } from 'payload';
import { OverpassError } from '@/payload/osm/overpass';

type Bounds = [number, number, number, number];

interface NetworkEndpointOptions<Way> {
  fetchWays(bounds: Bounds): Promise<Way[]>;
  invalidMessage: string;
  label: string;
  maxCachedCells: number;
  parseBounds(params: URLSearchParams): Bounds | null;
}

// Per server instance. OSM changes over days; repeated editor views should not
// each cost a request against the shared community endpoint.
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

/** Admin network reads share caching, eviction, and one fetch per pending cell. */
export function createNetworkEndpoint<Way>({
  fetchWays,
  invalidMessage,
  label,
  maxCachedCells,
  parseBounds,
}: NetworkEndpointOptions<Way>): {
  clearCache(): void;
  handler: PayloadHandler;
} {
  const cache = new Map<string, { at: number; ways: Way[] }>();
  const inFlight = new Map<string, Promise<Way[]>>();

  function load(bounds: Bounds): Promise<Way[]> {
    const key = bounds.join(',');
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
      return Promise.resolve(hit.ways);
    }
    const pending = inFlight.get(key);
    if (pending) return pending;

    // A shared fetch must not inherit one caller's abort signal: closing one
    // editor must not cancel a cell another editor is still waiting for.
    const request = fetchWays(bounds)
      .then((ways) => {
        cache.delete(key);
        cache.set(key, { at: Date.now(), ways });
        // Each insertion exceeds the configured capacity by at most one.
        if (cache.size > maxCachedCells) {
          cache.delete(cache.keys().next().value as string);
        }
        return ways;
      })
      .finally(() => inFlight.delete(key));
    inFlight.set(key, request);
    return request;
  }

  return {
    clearCache() {
      cache.clear();
      inFlight.clear();
    },
    handler: async (req) => {
      if (req.user?.role !== 'admin') {
        return Response.json(
          { message: 'Sign in as an admin to load the network.' },
          { status: req.user ? 403 : 401 },
        );
      }
      const bounds = parseBounds(req.searchParams);
      if (!bounds) {
        return Response.json({ message: invalidMessage }, { status: 400 });
      }
      try {
        return Response.json(
          { ways: await load(bounds) },
          {
            headers: { 'Cache-Control': 'private, max-age=3600' },
          },
        );
      } catch (error) {
        const message =
          error instanceof OverpassError
            ? error.message
            : 'The network could not be loaded from OpenStreetMap.';
        req.payload.logger.warn({
          err: error,
          msg: `${label} ${bounds.join(',')}: ${message}`,
        });
        return Response.json({ message }, { status: 502 });
      }
    },
  };
}

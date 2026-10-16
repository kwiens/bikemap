import type { PayloadHandler } from 'payload';
import { OverpassError } from '@/payload/osm/overpass';
import { cellBounds } from '@/payload/routing/cells';
import { fetchRouteNetwork } from '@/payload/routing/fetch-network';
import type { NetworkWay } from '@/payload/routing/graph';

export interface RouteNetworkResponse {
  ways: NetworkWay[];
}

/**
 * How long a cell stays cached. Roads and trails in OSM change on the order of
 * days, and every miss is a request against the public Overpass instance.
 */
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_CACHED_CELLS = 128;

/**
 * Cached cells, in insertion order so the oldest is evicted first. Per server
 * instance and lost on restart, which is enough: an editor working on one
 * route asks for the same handful of cells over and over.
 */
const cache = new Map<string, { at: number; ways: NetworkWay[] }>();

/**
 * The rideable OSM network in one grid cell, for the route editor.
 *
 * `GET /api/routes/network?cell=x,y` (see `routing/cells.ts`). Admin only: it
 * proxies a shared community endpoint, and nothing public needs it.
 */
export const routeNetwork: PayloadHandler = async (req) => {
  if (req.user?.role !== 'admin') {
    return Response.json(
      { message: 'Sign in to load the network.' },
      { status: 401 },
    );
  }

  const key = req.searchParams.get('cell') ?? '';
  const bounds = cellBounds(key);
  if (!bounds) {
    return Response.json(
      { message: 'cell must be two grid indexes, "x,y".' },
      { status: 400 },
    );
  }

  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return respond(hit.ways);
  }

  try {
    const ways = await fetchRouteNetwork(bounds, { signal: req.signal });
    cache.delete(key);
    cache.set(key, { at: Date.now(), ways });
    while (cache.size > MAX_CACHED_CELLS) {
      cache.delete(cache.keys().next().value as string);
    }
    return respond(ways);
  } catch (error) {
    const message =
      error instanceof OverpassError
        ? error.message
        : 'The network could not be loaded from OpenStreetMap.';
    req.payload.logger.warn({
      err: error,
      msg: `Route network ${key}: ${message}`,
    });
    return Response.json({ message }, { status: 502 });
  }
};

function respond(ways: NetworkWay[]): Response {
  return Response.json({ ways } satisfies RouteNetworkResponse, {
    headers: { 'Cache-Control': 'private, max-age=3600' },
  });
}

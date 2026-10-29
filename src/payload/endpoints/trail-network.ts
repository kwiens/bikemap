import { fetchTrailNetwork } from '@/payload/osm/overpass';
import { NETWORK_CELL_DEG, type NetworkWay } from '@/payload/osm/trail-network';
import { createNetworkEndpoint } from './network-endpoint';

export interface TrailNetworkResponse {
  ways: NetworkWay[];
}

/** The widest box accepted on either axis: one grid cell. */
const MAX_SPAN_DEG = NETWORK_CELL_DEG;

/** GET /api/trails/network?bbox=west,south,east,north. */
const endpoint = createNetworkEndpoint({
  fetchWays: fetchTrailNetwork,
  invalidMessage: `bbox must be west,south,east,north and at most ${MAX_SPAN_DEG}° across.`,
  label: 'Trail network',
  // Trail cells are much larger than road-network cells.
  maxCachedCells: 16,
  parseBounds: (params) => parseBbox(params.get('bbox')),
});

export const trailNetwork = endpoint.handler;
export const clearTrailNetworkCache = endpoint.clearCache;

function parseBbox(
  value: string | null,
): [number, number, number, number] | null {
  const numbers = (value ?? '').split(',').map(Number);
  if (numbers.length !== 4 || !numbers.every(Number.isFinite)) {
    return null;
  }
  const [west, south, east, north] = numbers;
  const valid =
    west >= -180 &&
    east <= 180 &&
    south >= -90 &&
    north <= 90 &&
    west < east &&
    south < north &&
    // A hair of slack for the client's rounding of cell edges.
    east - west <= MAX_SPAN_DEG + 1e-9 &&
    north - south <= MAX_SPAN_DEG + 1e-9;
  return valid ? [west, south, east, north] : null;
}

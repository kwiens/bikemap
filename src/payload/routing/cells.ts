/**
 * The fixed grid the route network is fetched in.
 *
 * Fetching by fixed cells rather than "whatever is on screen" makes requests
 * cacheable on both ends: panning back over an area asks for the same cells,
 * which the client already holds and the server has cached.
 *
 * The size is a trade between request count and response size, and request
 * count is what hurts: every cell is a query against the public Overpass
 * instance, which starts shedding load (504) after a burst. Measured in
 * downtown Chattanooga, a 0.02° cell of roads was 35–225 KB — so a 0.04° cell
 * is around a megabyte at worst, far under the response limit, while a
 * typical leg needs a quarter of the requests.
 *
 * Client-safe.
 */

/** Cell size in degrees: about 3.2 × 4.4 km at Bend's latitude. */
export const ROUTE_CELL_DEG = 0.04;

/**
 * How far past a leg's endpoints the network is loaded, in degrees (~1 km), so
 * the router can find a route that bows out around an obstacle.
 */
export const LEG_MARGIN_DEG = 0.01;

/** Below this zoom the network is not drawn. */
export const MIN_NETWORK_ZOOM = 13;

/**
 * Below this zoom the view is not loaded just for display — only what routing
 * needs. A zoom-13 view spans several cells, each an Overpass query.
 */
export const MIN_VIEW_LOAD_ZOOM = 14;

/**
 * The most cells one leg may need — a leg of roughly 8 km — so two far-apart
 * clicks can't fetch a county.
 */
export const MAX_LEG_CELLS = 9;

export type CellKey = `${number},${number}`;

export function cellKey(x: number, y: number): CellKey {
  return `${x},${y}`;
}

/** Every cell a [west, south, east, north] box touches. */
export function cellsCovering([west, south, east, north]: [
  number,
  number,
  number,
  number,
]): CellKey[] {
  const keys: CellKey[] = [];
  for (
    let x = Math.floor(west / ROUTE_CELL_DEG);
    x <= Math.floor(east / ROUTE_CELL_DEG);
    x++
  ) {
    for (
      let y = Math.floor(south / ROUTE_CELL_DEG);
      y <= Math.floor(north / ROUTE_CELL_DEG);
      y++
    ) {
      keys.push(cellKey(x, y));
    }
  }
  return keys;
}

/** A cell's [west, south, east, north], or null for a malformed key. */
export function cellBounds(
  key: string,
): [number, number, number, number] | null {
  const match = /^(-?\d{1,5}),(-?\d{1,5})$/.exec(key);
  if (!match) {
    return null;
  }
  const x = Number(match[1]);
  const y = Number(match[2]);
  const west = x * ROUTE_CELL_DEG;
  const south = y * ROUTE_CELL_DEG;
  const bounds: [number, number, number, number] = [
    west,
    south,
    west + ROUTE_CELL_DEG,
    south + ROUTE_CELL_DEG,
  ];
  return west >= -180 && bounds[2] <= 180 && south >= -90 && bounds[3] <= 90
    ? bounds
    : null;
}

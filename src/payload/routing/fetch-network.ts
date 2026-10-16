/**
 * Fetches the rideable network in one grid cell from Overpass.
 *
 * Server-only in practice (it is called from the admin endpoint), though it
 * imports nothing Node-specific.
 */
import {
  DEFAULT_ENDPOINT,
  type OverpassElement,
  type OverpassOptions,
  requestWithRetry,
} from '@/payload/osm/overpass';
import type { NetworkWay } from './graph';
import { classifyWay } from './osm-classes';

/**
 * Highways fetched for routing. Footways are fetched only where bikes are
 * allowed — the rest are sidewalks, and in a city they would be most of the
 * response. Driveways and parking aisles are left out for the same reason.
 * `classifyWay` makes the final call on everything that comes back.
 */
const ROUTABLE_HIGHWAYS =
  'cycleway|path|track|bridleway|pedestrian|living_street|residential|unclassified|road|service|tertiary|tertiary_link|secondary|secondary_link|primary|primary_link';

export function routeNetworkQuery(
  [west, south, east, north]: [number, number, number, number],
  timeoutSeconds = 60,
): string {
  const box = `${south},${west},${north},${east}`;
  return (
    `[out:json][timeout:${timeoutSeconds}];(` +
    `way["highway"~"^(${ROUTABLE_HIGHWAYS})$"]["service"!~"^(driveway|parking_aisle|drive-through)$"](${box});` +
    `way["highway"="footway"]["bicycle"~"^(yes|designated|permissive)$"](${box});` +
    `way["mtb:scale"](${box});` +
    ');out geom;'
  );
}

/** Ways in the box, whole even where they run outside it, with node ids. */
export async function fetchRouteNetwork(
  bbox: [number, number, number, number],
  options: OverpassOptions = {},
): Promise<NetworkWay[]> {
  const response = await requestWithRetry(
    options.endpoint ?? DEFAULT_ENDPOINT,
    routeNetworkQuery(bbox, options.timeoutSeconds),
    options,
  );
  const payload = (await response.json()) as {
    elements?: (OverpassElement & { nodes?: number[] })[];
  };
  return networkWaysFrom(payload.elements ?? []);
}

export function networkWaysFrom(
  elements: (OverpassElement & { nodes?: number[] })[],
): NetworkWay[] {
  return elements.flatMap((element) => {
    const geometry = element.geometry ?? [];
    const nodes = element.nodes ?? [];
    if (
      element.type !== 'way' ||
      nodes.length < 2 ||
      nodes.length !== geometry.length
    ) {
      return [];
    }
    const tags = element.tags ?? {};
    const classified = classifyWay(tags);
    if (!classified) {
      return [];
    }
    return [
      {
        class: classified.class,
        coordinates: geometry.map(({ lat, lon }) => [lon, lat]),
        hasBikeLane: classified.hasBikeLane,
        id: element.id,
        name: tags.name ?? tags.ref ?? null,
        nodes,
      },
    ];
  });
}

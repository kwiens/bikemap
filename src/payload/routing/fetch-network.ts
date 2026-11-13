/**
 * Fetches the route-tracing network in one grid cell from Overpass.
 *
 * Server-only in practice (it is called from the admin endpoint), though it
 * imports nothing Node-specific.
 */
import {
  DEFAULT_ENDPOINT,
  type OverpassElement,
  type OverpassOptions,
  readOverpassElements,
  requestWithRetry,
} from '@/payload/osm/overpass';
import type { NetworkWay } from './graph';
import { classifyWay, ROUTABLE_HIGHWAYS } from './osm-classes';

export function routeNetworkQuery(
  [west, south, east, north]: [number, number, number, number],
  timeoutSeconds = 60,
): string {
  const box = `${south},${west},${north},${east}`;
  return (
    `[out:json][timeout:${timeoutSeconds}];(` +
    `way["highway"~"^(${ROUTABLE_HIGHWAYS})$"]["service"!~"^(driveway|parking_aisle|drive-through)$"]["area"!="yes"](${box});` +
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
  return networkWaysFrom(
    await readOverpassElements<OverpassElement & { nodes?: number[] }>(
      response,
    ),
  );
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

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { bendData } from '../../src/data/cities/bend';
import { repoRoot } from './shared';
import type { ImportedRoute } from './routes';

export const BEND_BIKE_NETWORK_GEOJSON =
  'public/data/bend/bike-network.geojson';

/** Build Bend's eight Casual route lines from the committed OSM network. */
export async function loadBendRoutes(): Promise<ImportedRoute[]> {
  const raw = await readFile(
    path.join(repoRoot, BEND_BIKE_NETWORK_GEOJSON),
    'utf8',
  );
  const collection = JSON.parse(raw) as {
    features: {
      geometry?: { coordinates?: [number, number][]; type?: string };
      properties?: { name?: string };
    }[];
  };
  const linesByName = new Map<string, [number, number][][]>();
  for (const feature of collection.features) {
    const name = feature.properties?.name;
    const coordinates = feature.geometry?.coordinates;
    if (
      name &&
      feature.geometry?.type === 'LineString' &&
      Array.isArray(coordinates)
    ) {
      const lines = linesByName.get(name) ?? [];
      lines.push(coordinates);
      linesByName.set(name, lines);
    }
  }

  const sourceSha256 = createHash('sha256').update(raw).digest('hex');
  return bendData.bikeRoutes.map((route) => {
    const coordinates = linesByName.get(route.name);
    if (!coordinates?.length) {
      throw new Error(
        `bend routes: no ${BEND_BIKE_NETWORK_GEOJSON} features named "${route.name}"`,
      );
    }
    return {
      city: 'bend',
      geom: { coordinates, type: 'MultiLineString' },
      route,
      sourceFeatureCount: coordinates.length,
      sourcePath: BEND_BIKE_NETWORK_GEOJSON,
      sourceSha256,
    };
  });
}

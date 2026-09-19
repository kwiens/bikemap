/**
 * Measure the imported Chattanooga GIS geometry and regenerate every artifact
 * that displays or stores a derived value.
 *
 *   pnpm prepare:chattanooga-measurements
 *
 * Requires NEXT_PUBLIC_MAPBOX_TOKEN for Terrain-RGB. The script reads the
 * generated regional-trails GeoJSON, uses the same `measureParts` function as
 * Payload saves/backfills, and writes:
 *
 *   - summary measurements used by the checked-in trail metadata and seed
 *   - static elevation profiles used when Payload is unavailable/unseeded
 *
 * All measurements are completed before anything is written, so a terrain or
 * validation failure cannot leave a half-regenerated set of artifacts.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mountainBikeTrails } from '../src/data/mountain-bike-trails.data';
import { slugForTrail } from '../src/data/mountain-bike-trails';
import { measureParts, type Measurements } from '../src/payload/osm/measure';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

const GEOJSON = path.join(repoRoot, 'public/data/chattanooga/trails.geojson');
const PROFILE_DIR = path.join(repoRoot, 'public/data/elevation/chattanooga');
const SUMMARY = path.join(
  repoRoot,
  'src/data/cities/chattanooga/trail-measurements.json',
);

interface TrailFeature {
  geometry: MultiLineString;
  properties: { Trail?: string };
}

interface MultiLineString {
  coordinates: [number, number][][];
  type: 'MultiLineString';
}

interface TrailMeasurement {
  defaultBounds: [number, number, number, number];
  distance: number;
  elevationGain: number;
  elevationLoss: number;
  elevationMax: number;
  elevationMin: number;
}

interface PreparedTrail {
  measurement: TrailMeasurement;
  profile: NonNullable<Measurements['profile']>;
  slug: string;
  trailName: string;
}

async function loadGeometry(): Promise<Map<string, MultiLineString>> {
  const raw = await readFile(GEOJSON, 'utf8');
  const collection = JSON.parse(raw) as { features: TrailFeature[] };
  return new Map(
    collection.features
      .filter(
        (feature) =>
          feature.properties.Trail &&
          feature.geometry?.type === 'MultiLineString',
      )
      .map((feature) => [feature.properties.Trail as string, feature.geometry]),
  );
}

function requireCompleteMeasurement(
  trailName: string,
  measured: Measurements,
): TrailMeasurement {
  if (
    !measured.bounds ||
    measured.elevationGain === null ||
    measured.elevationLoss === null ||
    measured.elevationMax === null ||
    measured.elevationMin === null ||
    !measured.profile
  ) {
    throw new Error(
      `${trailName}: terrain measurement was incomplete; no files were written.`,
    );
  }

  return {
    defaultBounds: measured.bounds,
    distance: measured.distance,
    elevationGain: measured.elevationGain,
    elevationLoss: measured.elevationLoss,
    elevationMax: measured.elevationMax,
    elevationMin: measured.elevationMin,
  };
}

function requireEveryPartInProfile(
  trailName: string,
  geometry: MultiLineString,
  profile: NonNullable<Measurements['profile']>,
): void {
  const profileCoordinates = new Set(
    profile.profile.map(
      ([, , longitude, latitude]) => `${longitude},${latitude}`,
    ),
  );

  for (const part of geometry.coordinates) {
    const endpoints = [part[0], part[part.length - 1]];
    for (const [longitude, latitude] of endpoints) {
      if (!profileCoordinates.has(`${longitude},${latitude}`)) {
        throw new Error(
          `${trailName}: its prepared profile omitted a geometry part; no files were written.`,
        );
      }
    }
  }
}

async function prepareTrails(
  geometry: Map<string, MultiLineString>,
  token: string,
): Promise<PreparedTrail[]> {
  const prepared: PreparedTrail[] = [];
  const slugs = new Set<string>();

  for (const trail of mountainBikeTrails) {
    const geom = geometry.get(trail.trailName);
    if (!geom) {
      continue;
    }

    const slug = slugForTrail(trail);
    if (slugs.has(slug)) {
      throw new Error(`Duplicate Chattanooga profile slug: ${slug}`);
    }
    slugs.add(slug);

    const measured = await measureParts(geom.coordinates, trail.displayName, {
      mapboxToken: token,
    });
    const measurement = requireCompleteMeasurement(trail.trailName, measured);
    requireEveryPartInProfile(
      trail.trailName,
      geom,
      measured.profile as NonNullable<Measurements['profile']>,
    );
    prepared.push({
      measurement,
      profile: measured.profile as NonNullable<Measurements['profile']>,
      slug,
      trailName: trail.trailName,
    });
    console.log(
      `${prepared.length}: ${trail.trailName} — ${measurement.distance.toFixed(2)} mi`,
    );
  }

  return prepared;
}

async function writeArtifacts(prepared: PreparedTrail[]): Promise<void> {
  await mkdir(PROFILE_DIR, { recursive: true });

  const summaries = prepared
    .map(({ measurement, trailName }) => [trailName, measurement] as const)
    .sort(([a], [b]) => a.localeCompare(b, 'en'));

  const summaryJson = `{
${summaries
  .map(
    ([trailName, measurement]) =>
      `  ${JSON.stringify(trailName)}: {
    "defaultBounds": [${measurement.defaultBounds.join(', ')}],
    "distance": ${measurement.distance},
    "elevationGain": ${measurement.elevationGain},
    "elevationLoss": ${measurement.elevationLoss},
    "elevationMax": ${measurement.elevationMax},
    "elevationMin": ${measurement.elevationMin}
  }`,
  )
  .join(',\n')}
}
`;

  await Promise.all([
    writeFile(SUMMARY, summaryJson),
    ...prepared.map(({ profile, slug }) =>
      writeFile(
        path.join(PROFILE_DIR, `${slug}.json`),
        `${JSON.stringify(profile)}\n`,
      ),
    ),
  ]);
}

async function main(): Promise<void> {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!token) {
    throw new Error(
      'NEXT_PUBLIC_MAPBOX_TOKEN is required to regenerate elevation profiles.',
    );
  }

  const geometry = await loadGeometry();
  const prepared = await prepareTrails(geometry, token);
  if (prepared.length === 0) {
    throw new Error('No curated Chattanooga trails matched the GIS GeoJSON.');
  }

  await writeArtifacts(prepared);
  console.log(
    `Wrote ${prepared.length} measurement summaries and static profiles.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

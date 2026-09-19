/**
 * Normalize the verified Chattanooga route shapefile and upsert the result
 * directly into Payload. No generated GIS coordinates are written to Git.
 *
 *   pnpm db:import:chattanooga-routes "/path/to/GIS/Uncompressed files"
 *   pnpm db:import:chattanooga-routes "/path/to/GIS/Uncompressed files" --dry-run
 */
import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import type { Payload } from 'payload';
import { chattanoogaData } from '../src/data/cities/chattanooga';
import type { Route } from '../src/payload-types';
import type { MultiLineString } from './seed/shared';
import { connect, repoRoot } from './seed/shared';

const execFileAsync = promisify(execFile);
const PYTHON_SCRIPT = path.join(
  repoRoot,
  'scripts/prepare_chattanooga_routes.py',
);

interface NormalizedRouteFeature {
  geometry: MultiLineString;
  properties: {
    id: string;
    sourceFeatureCount: number;
    sourcePath: string;
    sourceSha256: string;
  };
  type: 'Feature';
}

interface ImportOptions {
  dryRun: boolean;
  sourceRoot: string;
}

function parseArgs(argv: string[]): ImportOptions {
  const dryRun = argv.includes('--dry-run');
  const positional = argv.filter((argument) => argument !== '--dry-run');
  if (positional.length !== 1) {
    throw new Error(
      'Usage: pnpm db:import:chattanooga-routes "/path/to/GIS/Uncompressed files" [--dry-run]',
    );
  }
  return { dryRun, sourceRoot: positional[0] };
}

async function normalizeRoutes(
  sourceRoot: string,
): Promise<NormalizedRouteFeature[]> {
  const { stdout } = await execFileAsync(
    process.env.PYTHON_BINARY || 'python3',
    [PYTHON_SCRIPT, sourceRoot, '--stdout'],
    { maxBuffer: 10 * 1024 * 1024 },
  );
  const collection = JSON.parse(stdout) as {
    features?: NormalizedRouteFeature[];
    type?: string;
  };
  if (
    collection.type !== 'FeatureCollection' ||
    !Array.isArray(collection.features) ||
    collection.features.length === 0
  ) {
    throw new Error('Route normalizer returned no features.');
  }
  return collection.features;
}

async function upsertRoute(
  payload: Payload,
  feature: NormalizedRouteFeature,
): Promise<'created' | 'updated'> {
  const route = chattanoogaData.bikeRoutes.find(
    (candidate) => candidate.id === feature.properties.id,
  );
  if (!route) {
    throw new Error(
      `Normalized route "${feature.properties.id}" has no configured BikeRoute.`,
    );
  }

  const data = {
    _status: 'published' as const,
    city: 'chattanooga' as const,
    geom: feature.geometry as unknown as Route['geom'],
    name: route.name,
    routeId: route.id,
    sourceFeatureCount: feature.properties.sourceFeatureCount,
    sourcePath: feature.properties.sourcePath,
    sourceSha256: feature.properties.sourceSha256,
  };
  const existing = await payload.find({
    collection: 'routes',
    depth: 0,
    limit: 1,
    pagination: false,
    where: {
      and: [
        { city: { equals: 'chattanooga' } },
        { routeId: { equals: route.id } },
      ],
    },
  });

  if (existing.docs[0]) {
    await payload.update({
      collection: 'routes',
      id: existing.docs[0].id,
      data,
    });
    return 'updated';
  }

  await payload.create({ collection: 'routes', data });
  return 'created';
}

async function main(): Promise<void> {
  const { dryRun, sourceRoot } = parseArgs(process.argv.slice(2));
  const features = await normalizeRoutes(sourceRoot);

  if (dryRun) {
    process.stdout.write(
      `chattanooga routes: validated ${features.length} normalized feature(s); no database writes\n`,
    );
    return;
  }

  const payload = await connect();
  const results = await Promise.all(
    features.map((feature) => upsertRoute(payload, feature)),
  );
  const created = results.filter((result) => result === 'created').length;
  const updated = results.length - created;
  payload.logger.info(
    `chattanooga routes: ${created} created, ${updated} updated`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

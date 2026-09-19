import type { Payload } from 'payload';
import { isDeepStrictEqual } from 'node:util';
import type { BikeRoute } from '../../src/data/bike-routes';
import type { Route } from '../../src/payload-types';
import type { CityId } from '../../src/data/cities/types';
import type { MultiLineString } from './shared';

export interface ImportedRoute {
  city: CityId;
  geom: MultiLineString;
  route: BikeRoute;
  sourceFeatureCount: number;
  sourcePath: string;
  sourceSha256: string;
}

/** Upsert one database-owned imported route by its stable city + route id. */
export async function upsertImportedRoute(
  payload: Payload,
  input: ImportedRoute,
): Promise<'created' | 'preserved' | 'unchanged' | 'updated'> {
  const { city, geom, route } = input;
  const data = {
    _status: 'published' as const,
    bounds: route.defaultBounds,
    city,
    color: route.color,
    defaultWidth: route.defaultWidth,
    description: route.description,
    distance: route.distance,
    geom: geom as unknown as Route['geom'],
    geometrySource: 'imported' as const,
    hideArrows: route.hideArrows ?? false,
    kind: route.kind ?? 'ride',
    name: route.name,
    opacity: route.opacity,
    reverseArrowBounds: route.reverseArrowBounds,
    reverseDirection: route.reverseDirection ?? false,
    routeId: route.id,
    sourceFeatureCount: input.sourceFeatureCount,
    sourcePath: input.sourcePath,
    sourceSha256: input.sourceSha256,
    sourceTrail: null,
  };
  const existing = await payload.find({
    collection: 'routes',
    depth: 0,
    limit: 1,
    pagination: false,
    where: {
      and: [{ city: { equals: city } }, { routeId: { equals: route.id } }],
    },
  });

  if (existing.docs[0]) {
    // A curator deliberately switched this public route to a Trail. Keep that
    // live relationship instead of silently restoring imported geometry on a
    // deploy or seed rerun.
    if (existing.docs[0].geometrySource === 'trail') {
      return 'preserved';
    }
    if (isCurrent(existing.docs[0], data)) {
      return 'unchanged';
    }
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

function isCurrent(
  existing: Route,
  expected: Record<string, unknown>,
): boolean {
  const scalarFields = [
    'city',
    'color',
    'defaultWidth',
    'description',
    'distance',
    'geometrySource',
    'hideArrows',
    'kind',
    'name',
    'opacity',
    'reverseDirection',
    'routeId',
    'sourceFeatureCount',
    'sourcePath',
    'sourceSha256',
    'sourceTrail',
  ] as const;
  return (
    scalarFields.every((field) =>
      expected[field] == null
        ? existing[field] == null
        : existing[field] === expected[field],
    ) &&
    isDeepStrictEqual(existing.geom ?? null, expected.geom ?? null) &&
    isDeepStrictEqual(existing.bounds ?? null, expected.bounds ?? null) &&
    isDeepStrictEqual(
      existing.reverseArrowBounds ?? null,
      expected.reverseArrowBounds ?? null,
    )
  );
}

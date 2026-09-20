import { ValidationError, type CollectionBeforeValidateHook } from 'payload';
import { isCityId } from '@/config/map.config';
import { parseTrailGeometry } from '@/payload/osm/geometry';
import { STYLE_OWNED_ROUTE_LAYER_IDS } from '@/data/mapbox-style';
import { slugify } from '@/utils/string';

type RouteData = Record<string, unknown>;

function valueOf(
  data: RouteData,
  originalDoc: RouteData | undefined,
  key: string,
): unknown {
  return key in data ? data[key] : originalDoc?.[key];
}

function relationshipId(value: unknown): number | string | null {
  if (typeof value === 'number' || typeof value === 'string') {
    return value;
  }
  if (value && typeof value === 'object' && 'id' in value) {
    const id = (value as { id?: unknown }).id;
    return typeof id === 'number' || typeof id === 'string' ? id : null;
  }
  return null;
}

function error(
  req: Parameters<CollectionBeforeValidateHook>[0]['req'],
  path: string,
  message: string,
): never {
  throw new ValidationError({
    collection: 'routes',
    errors: [{ message, path }],
    req,
  });
}

/**
 * Validates a route's mutually exclusive geometry source and fills the public
 * name/id from a selected trail when a curator leaves them blank.
 */
export const resolveRouteSource: CollectionBeforeValidateHook = async ({
  data,
  originalDoc,
  req,
}) => {
  if (!data) {
    return data;
  }

  const current = data as RouteData;
  const stored = originalDoc as RouteData | undefined;
  const source = valueOf(current, stored, 'geometrySource') ?? 'imported';
  const status = valueOf(current, stored, '_status');
  const isPublishing = status !== 'draft';

  current.geometrySource = source;

  if (source === 'trail') {
    const city = valueOf(current, stored, 'city');
    const sourceTrail = relationshipId(valueOf(current, stored, 'sourceTrail'));

    if (!sourceTrail) {
      if (isPublishing) {
        error(req, 'sourceTrail', 'Choose the trail this route follows.');
      }
      return current;
    }

    const trail = await req.payload.findByID({
      collection: 'trails',
      depth: 0,
      id: sourceTrail,
      req,
      select: {
        city: true,
        displayName: true,
        geom: true,
        slug: true,
        trailName: true,
        _status: true,
      },
    });

    if (
      !isCityId(city) ||
      trail.city !== city ||
      trail._status !== 'published'
    ) {
      error(
        req,
        'sourceTrail',
        'The selected trail must be published and belong to the same city as the route.',
      );
    }

    const parsed = parseTrailGeometry(trail.geom);
    if (isPublishing && (!parsed.ok || parsed.parts.length === 0)) {
      error(
        req,
        'sourceTrail',
        'The selected trail must have drawable geometry before this route can be published.',
      );
    }

    const name = trail.displayName || trail.trailName || 'Trail route';
    if (!valueOf(current, stored, 'name')) {
      current.name = name;
    }
    if (!valueOf(current, stored, 'routeId')) {
      current.routeId = trail.slug || slugify(name);
    }
    current.kind = 'trail';
    return current;
  }

  if (source !== 'imported' && source !== 'studio') {
    error(
      req,
      'geometrySource',
      'Choose imported geometry, an existing trail, or a Mapbox Studio layer.',
    );
  }

  current.sourceTrail = null;

  if (!isPublishing) {
    return current;
  }

  if (!valueOf(current, stored, 'name')) {
    error(req, 'name', 'Give this route a name.');
  }
  if (!valueOf(current, stored, 'routeId')) {
    error(req, 'routeId', 'Give this route a stable public identifier.');
  }

  if (source === 'studio') {
    const city = valueOf(current, stored, 'city');
    const routeId = valueOf(current, stored, 'routeId');
    if (
      city !== 'chattanooga' ||
      typeof routeId !== 'string' ||
      !STYLE_OWNED_ROUTE_LAYER_IDS.includes(routeId)
    ) {
      error(
        req,
        'routeId',
        'The route id must name a known Studio route layer for this city.',
      );
    }
    return current;
  }

  const parsed = parseTrailGeometry(valueOf(current, stored, 'geom'));
  if (!parsed.ok || parsed.parts.length === 0) {
    error(
      req,
      'geom',
      parsed.ok
        ? 'Route geometry must contain at least one line.'
        : parsed.error,
    );
  }

  for (const field of ['sourcePath', 'sourceSha256', 'sourceFeatureCount']) {
    if (!valueOf(current, stored, field)) {
      error(req, field, 'Imported routes must include import provenance.');
    }
  }

  return current;
};

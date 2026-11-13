import 'server-only';

import { getPayload } from 'payload';
import config from '@payload-config';
import type { CityId } from '@/data/cities/types';
import type { BikeRoute } from '@/data/bike-routes';
import {
  publicBikeRoutes,
  routeFeatureCollection,
  sourceTrailId,
  type RouteFeatureCollection,
  type StoredRouteTrail,
} from './routes-model';

export interface CityRouteData {
  geojson: RouteFeatureCollection;
  routes: BikeRoute[];
  status: 'empty' | 'ok' | 'unavailable';
}

const EMPTY = routeFeatureCollection([]);
const NONE = { geojson: EMPTY, routes: [] };

/** Read every published database-owned route for one city. Never throws. */
export async function getCityRoutes(city: CityId): Promise<CityRouteData> {
  if (!process.env.DATABASE_URL) {
    return { ...NONE, status: 'unavailable' };
  }

  try {
    const payload = await getPayload({ config });
    const result = await payload.find({
      collection: 'routes',
      depth: 0,
      limit: 500,
      pagination: false,
      select: {
        bounds: true,
        color: true,
        defaultWidth: true,
        description: true,
        distance: true,
        featured: true,
        geom: true,
        geometrySource: true,
        hideArrows: true,
        kind: true,
        name: true,
        opacity: true,
        reverseArrowBounds: true,
        reverseDirection: true,
        routeId: true,
        sourceFeatureCount: true,
        sourceTrail: true,
      },
      sort: 'name',
      where: {
        and: [{ city: { equals: city } }, { _status: { equals: 'published' } }],
      },
    });

    const sourceTrailIds = [
      ...new Set(
        result.docs.flatMap((route) => {
          const id =
            route.geometrySource === 'trail' ? sourceTrailId(route) : null;
          return id ? [id] : [];
        }),
      ),
    ];
    const sourceTrails = new Map<string, StoredRouteTrail>();
    if (sourceTrailIds.length > 0) {
      const trailResult = await payload.find({
        collection: 'trails',
        depth: 0,
        limit: 500,
        pagination: false,
        select: { bounds: true, distance: true, geom: true },
        where: {
          and: [
            { city: { equals: city } },
            { id: { in: sourceTrailIds } },
            { _status: { equals: 'published' } },
          ],
        },
      });
      for (const trail of trailResult.docs) {
        sourceTrails.set(String(trail.id), trail);
      }
    }

    const routes = publicBikeRoutes(result.docs, sourceTrails);
    return {
      geojson: routeFeatureCollection(result.docs, sourceTrails),
      routes,
      status: routes.length > 0 ? 'ok' : 'empty',
    };
  } catch (error) {
    console.error(`Could not read routes for "${city}" from Payload.`, error);
    return { ...NONE, status: 'unavailable' };
  }
}

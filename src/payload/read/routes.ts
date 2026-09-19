import 'server-only';

import { getPayload } from 'payload';
import config from '@payload-config';
import type { CityId } from '@/data/cities/types';
import {
  routeFeatureCollection,
  type RouteFeatureCollection,
} from './routes-model';

export interface CityRouteData {
  geojson: RouteFeatureCollection;
  status: 'empty' | 'ok' | 'unavailable';
}

const EMPTY = routeFeatureCollection([]);

/** Read every published database-owned route for one city. Never throws. */
export async function getCityRoutes(city: CityId): Promise<CityRouteData> {
  if (!process.env.DATABASE_URL) {
    return { geojson: EMPTY, status: 'unavailable' };
  }

  try {
    const payload = await getPayload({ config });
    const result = await payload.find({
      collection: 'routes',
      depth: 0,
      limit: 500,
      pagination: false,
      select: {
        geom: true,
        routeId: true,
        sourceFeatureCount: true,
      },
      sort: 'name',
      where: {
        and: [{ city: { equals: city } }, { _status: { equals: 'published' } }],
      },
    });

    return {
      geojson: routeFeatureCollection(result.docs),
      status: result.docs.length > 0 ? 'ok' : 'empty',
    };
  } catch (error) {
    console.error(
      `Could not read routes for "${city}" from Payload; leaving Studio routes in place.`,
      error,
    );
    return { geojson: EMPTY, status: 'unavailable' };
  }
}

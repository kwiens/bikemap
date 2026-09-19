import 'server-only';

/**
 * The numbers on the shared admin landing page. Each city uses one lightweight
 * metadata query plus two parallel counts for fields whose JSON payloads would
 * be expensive to load merely to test for existence.
 *
 * This never throws. A dashboard is the first page after signing in, so a
 * database outage should degrade this panel rather than make the admin unusable.
 */
import { getPayload, type Where } from 'payload';
import config from '@payload-config';
import type { CityId } from '@/data/cities/types';
import {
  summarizeTrails,
  type TrailSummary,
} from '@/payload/read/summary-model';

const NONE: Omit<TrailSummary, 'city'> = {
  drafts: null,
  missingGeometry: null,
  missingProfile: null,
  published: null,
  recent: [],
  unavailable: true,
  withWarnings: null,
};

export async function getTrailSummary(city: CityId): Promise<TrailSummary> {
  if (!process.env.DATABASE_URL) {
    return { ...NONE, city };
  }

  try {
    const payload = await getPayload({ config });
    const inCity: Where = { city: { equals: city } };
    const [result, missingGeometry, missingProfile] = await Promise.all([
      payload.find({
        collection: 'trails',
        depth: 0,
        limit: 5000,
        pagination: false,
        select: {
          _status: true,
          displayName: true,
          osmReport: true,
        },
        sort: '-updatedAt',
        where: inCity,
      }),
      payload.count({
        collection: 'trails',
        where: {
          and: [
            inCity,
            {
              _status: { equals: 'published' },
              geom: { exists: false },
            },
          ],
        },
      }),
      payload.count({
        collection: 'trails',
        where: {
          and: [
            inCity,
            {
              _status: { equals: 'published' },
              elevationProfile: { exists: false },
              geom: { exists: true },
            },
          ],
        },
      }),
    ]);

    return summarizeTrails(city, result.docs, {
      missingGeometry: missingGeometry.totalDocs,
      missingProfile: missingProfile.totalDocs,
    });
  } catch (error) {
    console.error(
      `Could not read the ${city} dashboard summary from Payload.`,
      error,
    );
    return { ...NONE, city };
  }
}

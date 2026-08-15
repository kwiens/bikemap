import 'server-only';

/**
 * Reads a trail's elevation profile out of Payload, by slug.
 *
 * The pane's chart has always come from `public/data/elevation/<slug>.json`,
 * generated offline by `scripts/add_trail_elevation.py`. That works for the
 * checked-in trails and not at all for one created in the admin: there is no
 * script run between saving a trail and looking at it, so the fetch 404s and
 * the pane shows a trail with no chart — while its distance and elevation
 * totals, which come from the database, sit right above it.
 *
 * The profile itself was never the problem. `measureParts` samples the terrain
 * on every save to *get* those totals and used to discard the per-point series
 * it computed on the way. Now it is stored, and this reads it back.
 *
 * **Never throws**, the same rule as `getCityTrails`: a missing database or a
 * bad query returns null and the pane simply has no chart, rather than the page
 * failing.
 */
import { getPayload } from 'payload';
import config from '@payload-config';
import type { CityId } from '@/data/cities/types';
import type { ElevationProfile } from '@/data/mountain-bike-trails';

/**
 * A stored profile for `slug` in `city`, or null.
 *
 * A straight lookup on the column, because `slug` is required and derived from
 * the trail name rather than optional — so the client can name a trail the same
 * way whether its chart comes from a static file or from here.
 *
 * The city has to be passed in: `slug` is indexed but not unique, so two cities
 * may both have a "Ridge Trail", and a caller that guesses wrong serves the
 * other one's chart. It cannot be read from the module-scope `activeCityId`
 * either — on the server that is always the env default, never the host the
 * request arrived on.
 */
export async function getTrailElevation(
  slug: string,
  city: CityId,
): Promise<ElevationProfile | null> {
  if (!process.env.DATABASE_URL || !slug) {
    return null;
  }

  try {
    const payload = await getPayload({ config });
    const result = await payload.find({
      collection: 'trails',
      depth: 0,
      limit: 1,
      pagination: false,
      select: { elevationProfile: true },
      where: {
        and: [
          { slug: { equals: slug } },
          { city: { equals: city } },
          { _status: { equals: 'published' } },
        ],
      },
    });

    const profile = result.docs[0]?.elevationProfile;
    return isProfile(profile) ? profile : null;
  } catch (error) {
    console.error(
      `Could not read the elevation profile for "${slug}" from Payload.`,
      error,
    );
    return null;
  }
}

/**
 * `elevationProfile` is untyped `jsonb`, and the pane indexes straight into
 * `profile[i][0]`. A half-written row must not become a runtime error there.
 */
function isProfile(value: unknown): value is ElevationProfile {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const points = (value as ElevationProfile).profile;
  return Array.isArray(points) && points.length > 0 && Array.isArray(points[0]);
}

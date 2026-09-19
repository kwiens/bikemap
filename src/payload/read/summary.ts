import 'server-only';

/**
 * The numbers on the admin landing page.
 *
 * Payload's default dashboard is a grid of cards, one per collection, all the
 * same size — it tells you the collections exist, which you knew. What a
 * curator actually wants on opening the admin is whether anything needs
 * attention: a trail with no line, one whose last save couldn't reach OSM, work
 * left in draft.
 *
 * **Never throws**, the same rule as `getCityTrails` and `getThemeCss`. A
 * dashboard is the first page after signing in, so an exception here is an
 * admin nobody can get into — over a decorative panel. Every count degrades to
 * null and the panel says so.
 */
import { getPayload, type Where } from 'payload';
import config from '@payload-config';
import { activeCityId } from '@/config/map.config';
import type { CityId } from '@/data/cities/types';

export interface TrailSummary {
  city: CityId;
  /** Published, and the ones the public map is therefore serving. */
  published: null | number;
  /** Saved but not published — work in progress. */
  drafts: null | number;
  /** Published with no line. These render nothing on the map. */
  missingGeometry: null | number;
  /** Published with a line but no elevation chart to draw. */
  missingProfile: null | number;
  /** Whose last build reported a gap, a missing way, or a failed fetch. */
  withWarnings: null | number;
  /** Most recently edited, for picking up where you left off. */
  recent: { id: number; name: string; updatedAt: string }[];
  /** True when the database could not be reached at all. */
  unavailable: boolean;
}

const NONE: Omit<TrailSummary, 'city'> = {
  drafts: null,
  missingGeometry: null,
  missingProfile: null,
  published: null,
  recent: [],
  unavailable: true,
  withWarnings: null,
};

export async function getTrailSummary(): Promise<TrailSummary> {
  const city = activeCityId;

  if (!process.env.DATABASE_URL) {
    return { ...NONE, city };
  }

  try {
    const payload = await getPayload({ config });
    const inCity = { city: { equals: city } };

    // `limit: 0` asks for the count without the rows. Six cheap counts beat
    // pulling a few hundred documents in to length them.
    const count = async (where: Where) =>
      (
        await payload.count({
          collection: 'trails',
          where: { and: [inCity, where] },
        })
      ).totalDocs;

    const [published, drafts, missingGeometry, missingProfile] =
      await Promise.all([
        count({ _status: { equals: 'published' } }),
        count({ _status: { not_equals: 'published' } }),
        count({
          _status: { equals: 'published' },
          geom: { exists: false },
        }),
        count({
          _status: { equals: 'published' },
          elevationProfile: { exists: false },
          geom: { exists: true },
        }),
      ]);

    // Counted here rather than in the query. `osmReport` is a plain `json`
    // column, and asking Postgres whether its `warnings` array is non-empty
    // needs indexing into it — `osmReport.warnings.0` compiles to a jsonb path
    // Postgres rejects outright. Selecting one small object per trail is the
    // cheaper mistake.
    const reports = await payload.find({
      collection: 'trails',
      depth: 0,
      limit: 5000,
      pagination: false,
      select: { osmReport: true },
      where: inCity,
    });
    const withWarnings = reports.docs.filter((trail) => {
      const report = trail.osmReport as { warnings?: unknown } | null;
      return Array.isArray(report?.warnings) && report.warnings.length > 0;
    }).length;

    const latest = await payload.find({
      collection: 'trails',
      depth: 0,
      limit: 5,
      pagination: false,
      select: { displayName: true, updatedAt: true },
      sort: '-updatedAt',
      where: inCity,
    });

    return {
      city,
      drafts,
      missingGeometry,
      missingProfile,
      published,
      recent: latest.docs.map((trail) => ({
        id: trail.id,
        name: trail.displayName ?? 'Untitled',
        updatedAt: trail.updatedAt ?? '',
      })),
      unavailable: false,
      withWarnings,
    };
  } catch (error) {
    console.error('Could not read the dashboard summary from Payload.', error);
    return { ...NONE, city };
  }
}

import 'server-only';

/**
 * Reads condition reports out of Payload for the public map.
 *
 * **Never throws**, same contract as `trails.ts` — conditions are a decoration
 * on a map that works without them, so a database hiccup costs a badge, not the
 * page.
 */
import { getPayload } from 'payload';
import config from '@payload-config';
import type { CityId } from '@/data/cities/types';
import {
  CONDITION_SUMMARY_DAYS,
  DEFAULT_CONDITION_COLOR,
} from '@/data/condition-vocabulary';
import {
  type ConditionOption,
  type ConditionReport,
  type ConditionSummary,
  resolveLockMessage,
} from '@/data/trail-conditions';
import type {
  Trail,
  TrailCondition,
  TrailConditionType,
} from '@/payload-types';

/**
 * At depth 1 a relationship arrives as its document — but only while the row
 * still points at one. A deleted condition leaves an id or a null; neither
 * should throw. Same unwrap `trails.ts` does for `rating`.
 */
function typeOf(report: TrailCondition): TrailConditionType | null {
  return report.condition && typeof report.condition === 'object'
    ? report.condition
    : null;
}

function trailOf(report: TrailCondition): Trail | null {
  return report.trail && typeof report.trail === 'object' ? report.trail : null;
}

function toOption(row: TrailConditionType): ConditionOption {
  return {
    color: row.color || DEFAULT_CONDITION_COLOR,
    description: row.description ?? undefined,
    name: row.name,
    value: row.value,
  };
}

/**
 * Colour and name come off the vocabulary row rather than the report, so
 * recolouring a condition repaints every badge that used it.
 */
function toReport(report: TrailCondition): ConditionReport | null {
  const type = typeOf(report);
  if (!type || !report.observedAt) {
    return null;
  }
  return {
    color: type.color || DEFAULT_CONDITION_COLOR,
    name: type.name,
    observedAt: new Date(report.observedAt).toISOString(),
    source: report.source === 'admin' ? 'admin' : 'public',
    value: type.value,
  };
}

const NO_SUMMARY: ConditionSummary = {
  latest: {},
  locked: {},
  options: [],
  // Open: a failure should not read as a deliberate closure.
  reporting: { enabled: true, message: '' },
};

/** The cutoff the summary query uses, as an ISO string. */
function summaryCutoff(now = new Date()): string {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - CONDITION_SUMMARY_DAYS);
  return cutoff.toISOString();
}

/**
 * The trails closed to new reports, and the note to show for each.
 *
 * Two targeted queries rather than reading every trail — only closed complexes
 * and closed trails come back. Sequential because the second needs the first's
 * ids.
 */
async function lockedTrails(
  payload: Awaited<ReturnType<typeof getPayload>>,
  city: CityId,
): Promise<Record<string, string>> {
  const inCity = { city: { equals: city } };

  const closedAreas = await payload.find({
    collection: 'trail-areas',
    depth: 0,
    limit: 500,
    pagination: false,
    select: { conditionReportsNote: true },
    where: { and: [inCity, { conditionReportsClosed: { equals: true } }] },
  });

  const areaNotes = new Map<number, string>();
  for (const area of closedAreas.docs) {
    areaNotes.set(area.id, area.conditionReportsNote ?? '');
  }

  const closedTrails = await payload.find({
    collection: 'trails',
    // 0: `area` arrives as an id, which is all the lookup above needs.
    depth: 0,
    limit: 2000,
    pagination: false,
    select: { area: true, conditionReportsNote: true, slug: true },
    where: {
      and: [
        inCity,
        { _status: { equals: 'published' } },
        {
          or: [
            { conditionReportsClosed: { equals: true } },
            ...(areaNotes.size > 0
              ? [{ area: { in: [...areaNotes.keys()] } }]
              : []),
          ],
        },
      ],
    },
  });

  const locked: Record<string, string> = {};
  for (const trail of closedTrails.docs) {
    if (!trail.slug) {
      continue;
    }
    const areaId = typeof trail.area === 'number' ? trail.area : trail.area?.id;
    // No site-wide note here: this only runs when the site switch is on, and
    // `disabledMessage` may still hold text from the last time it was off.
    locked[trail.slug] = resolveLockMessage(
      trail.conditionReportsNote,
      areaId === undefined ? undefined : areaNotes.get(areaId),
    );
  }

  return locked;
}

/**
 * The dropdown's options, the newest visible report per trail, and wherever
 * reporting is switched off.
 *
 * The reports are one query reduced in JS, not one per trail. Postgres can say
 * "latest per group" better, but only via a lateral join Payload's query builder
 * can't express, and a few hundred rows don't justify raw SQL.
 */
export async function getConditionSummary(
  city: CityId,
): Promise<ConditionSummary> {
  if (!process.env.DATABASE_URL) {
    return NO_SUMMARY;
  }

  try {
    const payload = await getPayload({ config });

    const [types, reports, settings] = await Promise.all([
      payload.find({
        collection: 'trail-condition-types',
        depth: 0,
        limit: 100,
        pagination: false,
        sort: 'sortOrder',
        where: { active: { not_equals: false } },
      }),
      payload.find({
        collection: 'trail-conditions',
        // 1 so `condition` and `trail` resolve to documents rather than ids.
        depth: 1,
        limit: 5000,
        pagination: false,
        sort: '-observedAt',
        where: {
          and: [
            { city: { equals: city } },
            { hidden: { not_equals: true } },
            { observedAt: { greater_than: summaryCutoff() } },
          ],
        },
      }),
      payload.findGlobal({ slug: 'condition-reporting', depth: 0 }),
    ]);

    // A global nobody has opened has no row at all, so absent means on.
    const enabled = settings?.enabled !== false;
    const siteNote = settings?.disabledMessage ?? '';

    const latest: Record<string, ConditionReport> = {};
    for (const row of reports.docs) {
      const trail = trailOf(row);
      // A report whose trail is gone shouldn't be reachable — Trails deletes its
      // reports first — but a direct SQL delete would leave one.
      if (!trail?.slug || latest[trail.slug]) {
        continue;
      }
      const report = toReport(row);
      if (report) {
        latest[trail.slug] = report;
      }
    }

    return {
      latest,
      // Skipped when the site switch is off — `reporting` already says every
      // trail is closed, in one field rather than hundreds of identical entries.
      locked: enabled ? await lockedTrails(payload, city) : {},
      options: types.docs.map(toOption),
      reporting: { enabled, message: siteNote },
    };
  } catch (error) {
    console.error(
      `Could not read trail conditions for "${city}" from Payload; the map will show none.`,
      error,
    );
    return NO_SUMMARY;
  }
}

/** How many past reports a trail's history shows. */
const HISTORY_LIMIT = 20;

/**
 * One trail's recent reports, newest first.
 *
 * Returns `null` only when the trail itself is unknown, so the route can tell a
 * 404 from a trail nobody has reported on yet — which answers `[]`.
 */
export async function getTrailConditionHistory(
  slug: string,
  city: CityId,
): Promise<ConditionReport[] | null> {
  if (!process.env.DATABASE_URL) {
    return null;
  }

  try {
    const payload = await getPayload({ config });

    const trails = await payload.find({
      collection: 'trails',
      depth: 0,
      limit: 1,
      pagination: false,
      select: { slug: true },
      where: {
        and: [
          { slug: { equals: slug } },
          { city: { equals: city } },
          { _status: { equals: 'published' } },
        ],
      },
    });

    const trail = trails.docs[0];
    if (!trail) {
      return null;
    }

    const reports = await payload.find({
      collection: 'trail-conditions',
      depth: 1,
      limit: HISTORY_LIMIT,
      pagination: false,
      sort: '-observedAt',
      where: {
        and: [
          { trail: { equals: trail.id } },
          { hidden: { not_equals: true } },
        ],
      },
    });

    return reports.docs
      .map(toReport)
      .filter((report): report is ConditionReport => report !== null);
  } catch (error) {
    console.error(
      `Could not read condition history for "${slug}" from Payload.`,
      error,
    );
    // Not null: the trail may well exist, and a 404 would send someone looking
    // for one that is right there.
    return [];
  }
}

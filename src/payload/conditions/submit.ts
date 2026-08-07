import 'server-only';

/**
 * The one door an anonymous condition report comes through.
 *
 * Everything deciding whether a report is allowed happens here, before the
 * write — which uses the Local API and so skips collection access control. See
 * the note on the TrailConditions collection.
 *
 * Returns a result rather than throwing: a rate-limited rider is an ordinary
 * outcome needing a sentence, not an exception.
 */
import { getPayload } from 'payload';
import config from '@payload-config';
import type { CityId } from '@/data/cities/types';
import {
  type ConditionReport,
  resolveLockMessage,
} from '@/data/trail-conditions';
import { DEFAULT_CONDITION_COLOR } from '@/data/condition-vocabulary';
import { RATE_LIMIT } from './guard';

export interface SubmitInput {
  city: CityId;
  /** The condition's stable `value`, not its name. */
  condition: string;
  observedAt: Date;
  reporterHash: string;
  /** The trail's slug. */
  slug: string;
}

export type SubmitResult =
  | {
      ok: false;
      reason: 'locked' | 'not-found' | 'rate-limited' | 'unavailable';
      message: string;
    }
  | { ok: true; report: ConditionReport };

function minutesAgo(minutes: number): string {
  const date = new Date();
  date.setMinutes(date.getMinutes() - minutes);
  return date.toISOString();
}

function hoursAgo(hours: number): string {
  const date = new Date();
  date.setHours(date.getHours() - hours);
  return date.toISOString();
}

export async function submitConditionReport(
  input: SubmitInput,
): Promise<SubmitResult> {
  if (!process.env.DATABASE_URL) {
    return {
      message: 'Reports are not available on this map.',
      ok: false,
      reason: 'unavailable',
    };
  }

  try {
    const payload = await getPayload({ config });

    // Both lookups are by the caller's strings, so they are the point at which
    // an arbitrary slug becomes a real row or nothing at all.
    const [trails, types, settings] = await Promise.all([
      payload.find({
        collection: 'trails',
        // 1 so the trail's complex arrives as a document — its lock is checked
        // below, and fetching it separately would cost a round trip per report.
        depth: 1,
        limit: 1,
        pagination: false,
        select: {
          area: true,
          conditionReportsClosed: true,
          conditionReportsNote: true,
          slug: true,
        },
        where: {
          and: [
            { slug: { equals: input.slug } },
            { city: { equals: input.city } },
            { _status: { equals: 'published' } },
          ],
        },
      }),
      payload.find({
        collection: 'trail-condition-types',
        depth: 0,
        limit: 1,
        pagination: false,
        where: {
          and: [
            { value: { equals: input.condition } },
            // A retired option is not on the form, so a request carrying one
            // did not come from the form.
            { active: { not_equals: false } },
          ],
        },
      }),
      payload.findGlobal({ slug: 'condition-reporting', depth: 0 }),
    ]);

    const trail = trails.docs[0];
    const type = types.docs[0];
    if (!trail || !type) {
      return {
        message: 'That trail or condition is not one we know about.',
        ok: false,
        reason: 'not-found',
      };
    }

    // Three levels, any one of which closes reporting. Checked here because
    // hiding the button on the client is only a courtesy.

    const area =
      trail.area && typeof trail.area === 'object' ? trail.area : null;
    const closed =
      settings?.enabled === false ||
      trail.conditionReportsClosed === true ||
      area?.conditionReportsClosed === true;

    if (closed) {
      return {
        // Same precedence the summary uses for the button's label.
        message: resolveLockMessage(
          settings?.enabled === false ? settings?.disabledMessage : null,
          trail.conditionReportsNote,
          area?.conditionReportsNote,
        ),
        ok: false,
        reason: 'locked',
      };
    }

    // Two limits: the hourly cap stops one person rewriting the whole map, the
    // per-trail cooldown stops one opinion being repeated until it looks agreed.
    const [recent, sameTrail] = await Promise.all([
      payload.count({
        collection: 'trail-conditions',
        where: {
          and: [
            { reporterHash: { equals: input.reporterHash } },
            { createdAt: { greater_than: hoursAgo(1) } },
          ],
        },
      }),
      payload.count({
        collection: 'trail-conditions',
        where: {
          and: [
            { reporterHash: { equals: input.reporterHash } },
            { trail: { equals: trail.id } },
            {
              createdAt: {
                greater_than: minutesAgo(RATE_LIMIT.perTrailMinutes),
              },
            },
          ],
        },
      }),
    ]);

    if (sameTrail.totalDocs > 0) {
      return {
        message: `You have already reported this trail in the last ${RATE_LIMIT.perTrailMinutes} minutes. Thanks — that is enough for now.`,
        ok: false,
        reason: 'rate-limited',
      };
    }

    if (recent.totalDocs >= RATE_LIMIT.perHour) {
      return {
        message: `That is ${RATE_LIMIT.perHour} reports in an hour, which is our limit. Please try again later.`,
        ok: false,
        reason: 'rate-limited',
      };
    }

    await payload.create({
      collection: 'trail-conditions',
      data: {
        city: input.city,
        condition: type.id,
        hidden: false,
        observedAt: input.observedAt.toISOString(),
        reporterHash: input.reporterHash,
        // Anything through this door is a rider; 'admin' is set by hand in the CMS.
        source: 'public',
        trail: trail.id,
      },
    });

    return {
      ok: true,
      report: {
        color: type.color || DEFAULT_CONDITION_COLOR,
        name: type.name,
        observedAt: input.observedAt.toISOString(),
        source: 'public',
        value: type.value,
      },
    };
  } catch (error) {
    console.error('Could not file a condition report.', error);
    return {
      message: 'Something went wrong saving that. Please try again.',
      ok: false,
      reason: 'unavailable',
    };
  }
}

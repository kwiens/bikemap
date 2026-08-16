/**
 * The shape trail conditions travel in, plus the rules about their age and
 * whether a trail is taking reports.
 *
 * Shared by the server and the client, so no Node-only imports.
 */
import { CONDITION_FRESH_DAYS } from './condition-vocabulary';
import { slugForTrail } from './mountain-bike-trails';

/** One option on the report form, out of the curated vocabulary. */
export interface ConditionOption {
  color: string;
  description?: string;
  name: string;
  /** The stable key. Match on this, never on `name`. */
  value: string;
}

/** One report, as the map shows it. */
export interface ConditionReport {
  color: string;
  /**
   * This condition means the trail is shut. Set on the condition type, not the
   * report, so a curator decides which grades count — the app never matches on
   * the value 'closed'.
   */
  marksClosed: boolean;
  name: string;
  /** ISO 8601. When the trail was ridden, not when this was submitted. */
  observedAt: string;
  /** `admin` means the trail steward said so, rather than a rider guessing. */
  source: 'admin' | 'public';
  value: string;
}

/** Shown where the Report button was, when nobody wrote a note. */
export const DEFAULT_LOCK_MESSAGE = 'This trail is not taking new reports.';

/** What `/api/map/conditions` answers with. */
export interface ConditionSummary {
  /** The newest visible report per trail slug. Trails with none are absent. */
  latest: Record<string, ConditionReport>;
  /**
   * Closed trails, keyed by slug, with the note already resolved through
   * trail → complex by the server. Absent means open, so this stays small.
   */
  locked: Record<string, string>;
  options: ConditionOption[];
  /** The site-wide switch, so a global closure needn't name every slug. */
  reporting: { enabled: boolean; message: string };
}

/**
 * The first note anyone actually wrote, or the default. Pass them most-specific
 * first. Blank and whitespace-only both count as having said nothing.
 */
export function resolveLockMessage(
  ...notes: (string | null | undefined)[]
): string {
  for (const note of notes) {
    const trimmed = note?.trim();
    if (trimmed) {
      return trimmed;
    }
  }
  return DEFAULT_LOCK_MESSAGE;
}

/**
 * Whether a trail takes reports, and what to say if not. The one place the three
 * switches are combined, so the button and the server's refusal agree. Any one
 * being off is enough; site-wide outranks a per-trail note.
 */
export function lockFor(
  summary: Pick<ConditionSummary, 'locked' | 'reporting'>,
  slug: string,
): null | string {
  if (!summary.reporting.enabled) {
    return summary.reporting.message || DEFAULT_LOCK_MESSAGE;
  }
  const message = summary.locked[slug];
  if (message === undefined) {
    return null;
  }
  return message || DEFAULT_LOCK_MESSAGE;
}

/**
 * A day-only observation ("when it was ridden") pinned to noon UTC.
 *
 * A `YYYY-MM-DD` value stored at 00:00Z reads as the *previous* calendar day for
 * any viewer west of UTC — so a report filed this afternoon ages to "yesterday"
 * by evening and the freshness cutoff expires hours early. Noon keeps the instant
 * on the intended calendar day across every US timezone.
 */
export function observedAtNoonUtc(dateOnly: string): string {
  const [year, month, day] = dateOnly.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12)).toISOString();
}

const MS_PER_DAY = 86_400_000;

/**
 * Whole days since a report, floored so "1 day ago" means a full day passed.
 * Rounding would age a four-hour-old report the moment the clock crossed noon.
 */
export function conditionAgeDays(
  observedAt: string,
  now: Date = new Date(),
): number {
  const then = new Date(observedAt).getTime();
  if (Number.isNaN(then)) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.max(0, Math.floor((now.getTime() - then) / MS_PER_DAY));
}

/**
 * Whether a report is recent enough to show as the current answer. The whole
 * staleness policy, in one place because the badge and the pane must agree.
 * Past the cutoff it stays in history but stops being the badge — a "Dry" pill
 * from October would be confidently wrong in March.
 */
export function isConditionFresh(
  observedAt: string,
  now: Date = new Date(),
): boolean {
  return conditionAgeDays(observedAt, now) < CONDITION_FRESH_DAYS;
}

/**
 * Whether a report still stands.
 *
 * Everything fades after a fortnight except a closure, which holds until
 * somebody reports something else. A closure is a state, not an observation — a
 * trail does not quietly reopen because nobody has ridden it lately, and
 * expiring one would take a barrier off the map on a timer.
 */
export function isConditionCurrent(
  report: ConditionReport,
  now: Date = new Date(),
): boolean {
  return report.marksClosed || isConditionFresh(report.observedAt, now);
}

/** Whether this trail's newest report says it is shut. */
export function isTrailClosed(
  summary: Pick<ConditionSummary, 'latest'>,
  slug: string,
): boolean {
  return summary.latest[slug]?.marksClosed === true;
}

/**
 * The trails whose newest report says they are shut.
 *
 * Conditions are keyed by slug, but the map layers join on the trail name (or
 * on OSM way ids) — so the two are reconciled here, once, rather than in the
 * map code.
 */
export function closedTrails<T extends { slug?: string; trailName: string }>(
  summary: Pick<ConditionSummary, 'latest'>,
  trails: T[],
): T[] {
  return trails.filter((trail) => isTrailClosed(summary, slugForTrail(trail)));
}

/**
 * A human age — "today", "3 days ago", "2 weeks ago". Hand-rolled: this repo has
 * no date library, and `Intl.RelativeTimeFormat` still needs the unit choosing.
 */
export function conditionAgeLabel(
  observedAt: string,
  now: Date = new Date(),
): string {
  const days = conditionAgeDays(observedAt, now);

  if (!Number.isFinite(days)) {
    return 'at some point';
  }
  if (days === 0) {
    return 'today';
  }
  if (days === 1) {
    return 'yesterday';
  }
  if (days < 14) {
    return `${days} days ago`;
  }
  if (days < 60) {
    return `${Math.floor(days / 7)} weeks ago`;
  }
  // 60 rather than 30 so this never says "1 months ago".
  return `${Math.floor(days / 30)} months ago`;
}

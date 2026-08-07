/**
 * The shape trail conditions travel in, plus the rules about their age and
 * whether a trail is taking reports.
 *
 * Shared by the server and the client, so no Node-only imports.
 */
import { CONDITION_FRESH_DAYS } from './condition-vocabulary';

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

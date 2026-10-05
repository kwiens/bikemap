/**
 * Checks that stand between the public report form and the database.
 *
 * Pure — no Payload import, no `server-only` — so these are testable without a
 * database. The parts that need Payload live in `submit.ts`.
 *
 * A honeypot and a rate limit, no captcha: this is a regional trail map, the
 * realistic abuse is one bored local or a scraper, and anything more would be
 * configuration every fork has to do (ADR-0001 C3). A captcha would go here.
 */
import { createHash } from 'node:crypto';

/** The hidden form field. Anything that fills it in is not a person. */
export const HONEYPOT_FIELD = 'website';

export const RATE_LIMIT = {
  /** Reports one source may file in an hour, across all trails. */
  perHour: 5,
  /** Minutes one source must wait before re-reporting the *same* trail. */
  perTrailMinutes: 30,
};

/** How far back an observation may be dated, and how far forward. */
export const OBSERVED_WINDOW = {
  maxFutureHours: 24,
  maxPastDays: 30,
};

export interface ReportBody {
  condition?: unknown;
  observedAt?: unknown;
  slug?: unknown;
  [HONEYPOT_FIELD]?: unknown;
}

/**
 * Callers should answer a tripped honeypot with a plain 200 and no write. An
 * error would tell the bot which field is the trap.
 */
export function isHoneypotTripped(body: ReportBody): boolean {
  const value = body[HONEYPOT_FIELD];
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * The submitter's address, as far as it can be trusted.
 *
 * `x-forwarded-for` is client-settable, so this is only the real client when
 * something in front of the app rewrites it — true on Vercel and behind a normal
 * proxy, false if the app is exposed directly. Good enough for a speed bump.
 */
export function clientAddress(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) {
      return first;
    }
  }
  return headers.get('x-real-ip')?.trim() || 'unknown';
}

/**
 * A salted one-way hash of an address. The address itself is never stored — this
 * is enough to count one person's reports and find the rest of them, and not
 * enough to work back to who they are. Truncated; a rate-limit bucket needs no
 * more.
 */
export function hashReporter(address: string, salt: string): string {
  return createHash('sha256')
    .update(`${salt}:${address}`)
    .digest('hex')
    .slice(0, 32);
}

/**
 * Optional on purpose: falling back to `PAYLOAD_SECRET` means a fork gets salted
 * hashes without setting anything. Set `CONDITION_REPORT_SALT` to rotate the
 * hashes without signing anyone out.
 */
export function reporterSalt(
  env: Record<string, string | undefined> = process.env,
): string {
  return env.CONDITION_REPORT_SALT || env.PAYLOAD_SECRET || 'bikemap';
}

export type ParsedObservedAt =
  | { error: string; ok: false }
  | { ok: true; value: Date };

/**
 * Validates the "when did you ride it" date. Bounded both ways: a future date
 * would sit at the top of the feed until it arrived, and an old one is not a
 * condition. The day of forward slack is for riders ahead of the server.
 */
export function parseObservedAt(
  value: unknown,
  now: Date = new Date(),
): ParsedObservedAt {
  if (typeof value !== 'string' && !(value instanceof Date)) {
    return { error: 'A date is required.', ok: false };
  }

  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return { error: 'That date could not be read.', ok: false };
  }

  const future = new Date(now);
  future.setHours(future.getHours() + OBSERVED_WINDOW.maxFutureHours);
  if (parsed > future) {
    return { error: 'That date is in the future.', ok: false };
  }

  const past = new Date(now);
  past.setDate(past.getDate() - OBSERVED_WINDOW.maxPastDays);
  if (parsed < past) {
    return {
      error: `Reports older than ${OBSERVED_WINDOW.maxPastDays} days are not much use to anyone — please leave this one out.`,
      ok: false,
    };
  }

  // Store the day at noon UTC, not the 00:00Z a bare `YYYY-MM-DD` parses to:
  // midnight UTC reads as the day before west of UTC, aging every fresh report a
  // day early. The window checks above ran against the raw value.
  const atNoonUtc = new Date(
    Date.UTC(
      parsed.getUTCFullYear(),
      parsed.getUTCMonth(),
      parsed.getUTCDate(),
      12,
    ),
  );
  return { ok: true, value: atNoonUtc };
}

/** Rejects anything that isn't a plausible slug before it becomes a query. */
export function parseIdentifier(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 200) {
    return null;
  }
  return trimmed;
}

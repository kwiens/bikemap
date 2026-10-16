import { describe, expect, it } from 'vitest';
import {
  clientAddress,
  hashReporter,
  HONEYPOT_FIELD,
  isHoneypotTripped,
  OBSERVED_WINDOW,
  parseIdentifier,
  parseObservedAt,
  reporterSalt,
} from './guard';

/** A fixed "now" so the date-window tests don't drift with the clock. */
const NOW = new Date('2026-08-07T12:00:00.000Z');

function daysBefore(days: number): string {
  const date = new Date(NOW);
  date.setDate(date.getDate() - days);
  return date.toISOString();
}

describe('isHoneypotTripped', () => {
  it('is not tripped by an absent or empty field', () => {
    expect(isHoneypotTripped({})).toBe(false);
    expect(isHoneypotTripped({ [HONEYPOT_FIELD]: '' })).toBe(false);
    // Whitespace only is still a human who tabbed through it somehow.
    expect(isHoneypotTripped({ [HONEYPOT_FIELD]: '   ' })).toBe(false);
  });

  it('is tripped by anything typed into it', () => {
    expect(isHoneypotTripped({ [HONEYPOT_FIELD]: 'http://spam.example' })).toBe(
      true,
    );
  });

  it('ignores non-string values rather than throwing', () => {
    expect(isHoneypotTripped({ [HONEYPOT_FIELD]: 42 })).toBe(false);
    expect(isHoneypotTripped({ [HONEYPOT_FIELD]: null })).toBe(false);
  });
});

describe('clientAddress', () => {
  it('takes the first entry of x-forwarded-for', () => {
    const headers = new Headers({
      'x-forwarded-for': '203.0.113.5, 70.41.3.18, 150.172.238.178',
    });
    expect(clientAddress(headers)).toBe('203.0.113.5');
  });

  it('falls back to x-real-ip, then to a constant', () => {
    expect(clientAddress(new Headers({ 'x-real-ip': '203.0.113.9' }))).toBe(
      '203.0.113.9',
    );
    expect(clientAddress(new Headers())).toBe('unknown');
  });

  it('does not return an empty string from a malformed header', () => {
    expect(clientAddress(new Headers({ 'x-forwarded-for': ' , ' }))).toBe(
      'unknown',
    );
  });
});

describe('hashReporter', () => {
  it('is stable for the same address and salt', () => {
    expect(hashReporter('203.0.113.5', 'pepper')).toBe(
      hashReporter('203.0.113.5', 'pepper'),
    );
  });

  it('separates different addresses, and different salts', () => {
    expect(hashReporter('203.0.113.5', 'pepper')).not.toBe(
      hashReporter('203.0.113.6', 'pepper'),
    );
    // Rotating the salt must invalidate the old buckets, or rotation is a no-op.
    expect(hashReporter('203.0.113.5', 'pepper')).not.toBe(
      hashReporter('203.0.113.5', 'salt'),
    );
  });

  it('does not contain the address it was made from', () => {
    const hash = hashReporter('203.0.113.5', 'pepper');
    expect(hash).not.toContain('203.0.113.5');
    expect(hash).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe('reporterSalt', () => {
  it('prefers its own variable, falls back to the Payload secret', () => {
    expect(
      reporterSalt({
        CONDITION_REPORT_SALT: 'own',
        PAYLOAD_SECRET: 'payload',
      }),
    ).toBe('own');
    expect(reporterSalt({ PAYLOAD_SECRET: 'payload' })).toBe('payload');
  });

  it('still returns something when neither is set', () => {
    // A weak salt is bad; an empty one that makes every hash identical, and so
    // rate-limits the whole internet as one person, is worse.
    expect(reporterSalt({})).toBeTruthy();
  });
});

describe('parseObservedAt', () => {
  it('accepts today and yesterday', () => {
    expect(parseObservedAt(NOW.toISOString(), NOW).ok).toBe(true);
    expect(parseObservedAt(daysBefore(1), NOW).ok).toBe(true);
  });

  it('accepts a date at the far edge of the window', () => {
    expect(
      parseObservedAt(daysBefore(OBSERVED_WINDOW.maxPastDays - 1), NOW).ok,
    ).toBe(true);
  });

  it('rejects a date beyond the past window', () => {
    const result = parseObservedAt(daysBefore(60), NOW);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/older than/);
  });

  it('rejects next week', () => {
    const nextWeek = new Date(NOW);
    nextWeek.setDate(nextWeek.getDate() + 7);
    const result = parseObservedAt(nextWeek.toISOString(), NOW);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/future/);
  });

  it('allows a day of slack forward, for riders ahead of the server', () => {
    const soon = new Date(NOW);
    soon.setHours(soon.getHours() + 12);
    expect(parseObservedAt(soon.toISOString(), NOW).ok).toBe(true);
  });

  it('rejects unparseable and non-date input', () => {
    expect(parseObservedAt('last tuesday', NOW).ok).toBe(false);
    expect(parseObservedAt(undefined, NOW).ok).toBe(false);
    expect(parseObservedAt(1_754_000_000_000, NOW).ok).toBe(false);
  });

  it('accepts a Date as well as a string', () => {
    expect(parseObservedAt(new Date(NOW), NOW).ok).toBe(true);
  });

  it('normalizes a day-only value to noon UTC, not midnight', () => {
    // A bare YYYY-MM-DD parses to 00:00Z, which reads as the day before west of
    // UTC; noon keeps it on the intended calendar day everywhere in the US.
    const result = parseObservedAt('2026-08-07', NOW);
    expect(result.ok).toBe(true);
    expect(result.ok === true && result.value.toISOString()).toBe(
      '2026-08-07T12:00:00.000Z',
    );
  });
});

describe('parseIdentifier', () => {
  it('trims and returns a plausible slug', () => {
    expect(parseIdentifier('  pointe-break ')).toBe('pointe-break');
  });

  it('rejects blanks, non-strings and anything oversized', () => {
    expect(parseIdentifier('')).toBeNull();
    expect(parseIdentifier('   ')).toBeNull();
    expect(parseIdentifier(null)).toBeNull();
    expect(parseIdentifier(['pointe-break'])).toBeNull();
    expect(parseIdentifier('x'.repeat(201))).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { CONDITION_FRESH_DAYS } from './condition-vocabulary';
import {
  conditionAgeDays,
  conditionAgeLabel,
  DEFAULT_LOCK_MESSAGE,
  isConditionFresh,
  lockFor,
  resolveLockMessage,
} from './trail-conditions';

const NOW = new Date('2026-08-07T12:00:00.000Z');

function daysBefore(days: number, hours = 0): string {
  const date = new Date(NOW);
  date.setDate(date.getDate() - days);
  date.setHours(date.getHours() - hours);
  return date.toISOString();
}

describe('conditionAgeDays', () => {
  it('floors rather than rounds', () => {
    // 20 hours ago is still "today" — rounding would call it a day old as soon
    // as the clock crossed the halfway mark, which reads as older than it is.
    expect(conditionAgeDays(daysBefore(0, 20), NOW)).toBe(0);
    expect(conditionAgeDays(daysBefore(1, 1), NOW)).toBe(1);
  });

  it('never goes negative for a report dated slightly ahead', () => {
    const ahead = new Date(NOW);
    ahead.setHours(ahead.getHours() + 6);
    expect(conditionAgeDays(ahead.toISOString(), NOW)).toBe(0);
  });

  it('treats an unreadable date as infinitely old', () => {
    expect(conditionAgeDays('not a date', NOW)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('isConditionFresh', () => {
  it('is fresh right up to the cutoff and stale on it', () => {
    expect(isConditionFresh(daysBefore(CONDITION_FRESH_DAYS - 1), NOW)).toBe(
      true,
    );
    expect(isConditionFresh(daysBefore(CONDITION_FRESH_DAYS), NOW)).toBe(false);
  });

  it('is stale for the October-report-in-March case', () => {
    expect(isConditionFresh(daysBefore(150), NOW)).toBe(false);
  });

  it('treats an unreadable date as stale rather than fresh', () => {
    // Wrong in the safe direction: a badge that fails to appear beats one that
    // confidently states a condition nobody can date.
    expect(isConditionFresh('', NOW)).toBe(false);
  });
});

describe('conditionAgeLabel', () => {
  it('names the recent days', () => {
    expect(conditionAgeLabel(daysBefore(0), NOW)).toBe('today');
    expect(conditionAgeLabel(daysBefore(1), NOW)).toBe('yesterday');
    expect(conditionAgeLabel(daysBefore(3), NOW)).toBe('3 days ago');
    expect(conditionAgeLabel(daysBefore(13), NOW)).toBe('13 days ago');
  });

  it('switches to weeks, then months', () => {
    expect(conditionAgeLabel(daysBefore(14), NOW)).toBe('2 weeks ago');
    expect(conditionAgeLabel(daysBefore(59), NOW)).toBe('8 weeks ago');
    expect(conditionAgeLabel(daysBefore(60), NOW)).toBe('2 months ago');
  });

  it('never says "1 months ago"', () => {
    // The whole point of the 60-day cutover. Walk the boundary rather than
    // trusting the arithmetic by eye.
    for (let days = 60; days < 400; days++) {
      expect(conditionAgeLabel(daysBefore(days), NOW)).not.toBe('1 months ago');
    }
  });

  it('degrades rather than printing NaN', () => {
    expect(conditionAgeLabel('nonsense', NOW)).toBe('at some point');
  });
});

describe('resolveLockMessage', () => {
  it('takes the first thing anyone actually wrote', () => {
    expect(resolveLockMessage('trail note', 'complex note')).toBe('trail note');
    expect(resolveLockMessage(null, 'complex note')).toBe('complex note');
  });

  it('treats blank and whitespace-only as having said nothing', () => {
    // A curator who ticks the box and leaves the note empty means "no comment",
    // not "show an empty line".
    expect(resolveLockMessage('', '   ', 'site note')).toBe('site note');
    expect(resolveLockMessage(undefined, null)).toBe(DEFAULT_LOCK_MESSAGE);
  });

  it('trims what it returns', () => {
    expect(resolveLockMessage('  Closed for logging.  ')).toBe(
      'Closed for logging.',
    );
  });
});

describe('lockFor', () => {
  const open = { locked: {}, reporting: { enabled: true, message: '' } };

  it('is open when nothing says otherwise', () => {
    expect(lockFor(open, 'pondo')).toBeNull();
  });

  it('closes one trail without touching the others', () => {
    const summary = { ...open, locked: { pondo: 'Closed for logging.' } };

    expect(lockFor(summary, 'pondo')).toBe('Closed for logging.');
    expect(lockFor(summary, 'homestead')).toBeNull();
  });

  it('falls back to the default when a locked trail has no note', () => {
    expect(lockFor({ ...open, locked: { pondo: '' } }, 'pondo')).toBe(
      DEFAULT_LOCK_MESSAGE,
    );
  });

  it('site-wide off closes every trail, named or not', () => {
    const summary = {
      locked: {},
      reporting: { enabled: false, message: 'Use the forum instead.' },
    };

    expect(lockFor(summary, 'pondo')).toBe('Use the forum instead.');
    expect(lockFor(summary, 'anything-at-all')).toBe('Use the forum instead.');
  });

  it('site-wide off outranks a per-trail note', () => {
    // Precedence has to match what the server enforces on submit, or the button
    // and the refusal would give different reasons.
    const summary = {
      locked: { pondo: 'Closed for logging.' },
      reporting: { enabled: false, message: 'Reporting is off for now.' },
    };

    expect(lockFor(summary, 'pondo')).toBe('Reporting is off for now.');
  });

  it('site-wide off with no message still explains itself', () => {
    const summary = { locked: {}, reporting: { enabled: false, message: '' } };

    expect(lockFor(summary, 'pondo')).toBe(DEFAULT_LOCK_MESSAGE);
  });
});

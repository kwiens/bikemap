import { describe, expect, it } from 'vitest';
import { RATING_COLORS, UNRATED_COLOR } from './trail-metadata';
import {
  DEFAULT_KIND_VALUE,
  DEFAULT_KINDS,
  DEFAULT_RATINGS,
  iconForKind,
  KIND_ICON_OPTIONS,
  KIND_ICONS,
  UNRATED_VALUE,
} from './trail-vocabulary';

// These defaults are seeded by a migration into a live database, so getting one
// wrong isn't a failed build — it's a row that has to be corrected by hand
// afterwards. They also have to keep matching the colours the checked-in data
// already uses, or migrating would visibly repaint the map.

describe('the default vocabularies', () => {
  it('carry the palette the map already draws with', () => {
    const byValue = new Map(DEFAULT_RATINGS.map((r) => [r.value, r.color]));
    expect(byValue.get('easy')).toBe(RATING_COLORS.easy);
    expect(byValue.get('intermediate')).toBe(RATING_COLORS.intermediate);
    expect(byValue.get('advanced')).toBe(RATING_COLORS.advanced);
    expect(byValue.get('expert')).toBe(RATING_COLORS.expert);
    expect(byValue.get(UNRATED_VALUE)).toBe(UNRATED_COLOR);
  });

  it('include the rows the app falls back to', () => {
    // A trail's rating and kind default to these, and the relationship is
    // required — without them a new trail cannot be created at all.
    expect(DEFAULT_RATINGS.some((r) => r.value === UNRATED_VALUE)).toBe(true);
    expect(DEFAULT_KINDS.some((k) => k.value === DEFAULT_KIND_VALUE)).toBe(
      true,
    );
  });

  it('use unique values, which are what the app matches on', () => {
    for (const seed of [DEFAULT_RATINGS, DEFAULT_KINDS]) {
      const values = seed.map((row) => row.value);
      expect(new Set(values).size).toBe(values.length);
    }
  });

  it('use slug-shaped values and 6-digit hex colours', () => {
    // Both are validated in the admin; the seeds bypass that validation by
    // going in as SQL, so they are checked here instead.
    for (const rating of DEFAULT_RATINGS) {
      expect(rating.value).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(rating.color).toMatch(/^#[0-9a-f]{6}$/i);
    }
    for (const kind of DEFAULT_KINDS) {
      expect(kind.value).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      if (kind.color) {
        expect(kind.color).toMatch(/^#[0-9a-f]{6}$/i);
      }
    }
  });

  it('order ratings easiest first, with unrated last', () => {
    // Drives the admin list and the dropdown on a trail; alphabetical would put
    // Advanced before Easy.
    const ordered = [...DEFAULT_RATINGS].sort(
      (a, b) => a.sortOrder - b.sortOrder,
    );
    expect(ordered.map((r) => r.value)).toEqual([
      'easy',
      'intermediate',
      'advanced',
      'expert',
      UNRATED_VALUE,
    ]);
  });

  it('name only icons that exist', () => {
    for (const kind of DEFAULT_KINDS) {
      expect(KIND_ICONS[kind.icon]).toBeDefined();
    }
    for (const option of KIND_ICON_OPTIONS) {
      expect(KIND_ICONS[option.value]).toBeDefined();
    }
  });

  it('offer every bundled icon as an option', () => {
    // A kind could otherwise reference an icon no curator can pick.
    expect(KIND_ICON_OPTIONS.map((o) => o.value).sort()).toEqual(
      Object.keys(KIND_ICONS).sort(),
    );
  });
});

describe('iconForKind', () => {
  it('maps a stored key back to an icon', () => {
    expect(iconForKind('route').iconName).toBe('route');
    expect(iconForKind('mountain').iconName).toBe('mountain');
  });

  it('falls back rather than returning nothing', () => {
    // Fed straight from the database, so it sees whatever is there — including
    // blank, and keys from a build that bundled different icons.
    for (const value of [null, undefined, '', 'helicopter']) {
      expect(iconForKind(value).iconName).toBe('mountain');
    }
  });
});

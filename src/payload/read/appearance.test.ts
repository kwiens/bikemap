import { describe, expect, it } from 'vitest';
import { RATING_COLORS, UNRATED_COLOR } from '@/data/trail-metadata';
import { GREENWAY_COLOR } from '@/data/trail-vocabulary';
import { appearanceFor } from './appearance';

// Ratings and kinds are curated in the admin, so these rows are whatever a
// curator left behind — including half-filled and deleted. Every case has to
// produce something drawable, because `getCityTrails` must never throw and an
// uncoloured trail is an invisible one.

const easy = { color: RATING_COLORS.easy, value: 'easy' };
const singletrack = { color: null, icon: 'mountain' };
const greenway = { color: GREENWAY_COLOR, icon: 'route' };

describe('appearanceFor', () => {
  it('takes its colour from the rating', () => {
    expect(appearanceFor(easy, singletrack).color).toBe(RATING_COLORS.easy);
  });

  it('lets the kind override the rating', () => {
    // How a greenway comes out green whatever its difficulty.
    expect(appearanceFor(easy, greenway).color).toBe(GREENWAY_COLOR);
  });

  it('falls back to the rating when the kind has no colour of its own', () => {
    // The normal case: only greenway-like kinds set one.
    expect(appearanceFor(easy, { color: '', icon: 'mountain' }).color).toBe(
      RATING_COLORS.easy,
    );
  });

  it('picks the icon from the kind', () => {
    expect(appearanceFor(easy, greenway).icon.iconName).toBe('route');
    expect(appearanceFor(easy, singletrack).icon.iconName).toBe('mountain');
  });

  it('falls back to the singletrack icon for an unknown key', () => {
    // A kind row can name an icon this build no longer bundles.
    expect(appearanceFor(easy, { icon: 'helicopter' }).icon.iconName).toBe(
      'mountain',
    );
  });

  it("flattens 'unrated' to the empty string the app uses", () => {
    // The vocabulary keeps an explicit row so it can carry a colour; the app
    // type has always spelled the same thing ''.
    const appearance = appearanceFor(
      { color: UNRATED_COLOR, value: 'unrated' },
      singletrack,
    );
    expect(appearance.rating).toBe('');
    expect(appearance.color).toBe(UNRATED_COLOR);
  });

  it('passes a custom rating straight through', () => {
    // The point of the collection: a grade nobody wrote into the code still
    // reaches the map, in its own colour.
    const appearance = appearanceFor(
      { color: '#ff00ff', value: 'double-black' },
      singletrack,
    );
    expect(appearance.rating).toBe('double-black');
    expect(appearance.color).toBe('#ff00ff');
  });

  it('still draws when the rating row was deleted', () => {
    // The relationship is ON DELETE set null, so this is reachable from the
    // admin — and a trail with no colour disappears into the basemap.
    for (const missing of [null, undefined]) {
      const appearance = appearanceFor(missing, singletrack);
      expect(appearance.color).toBe(UNRATED_COLOR);
      expect(appearance.rating).toBe('');
      expect(appearance.icon.iconName).toBe('mountain');
    }
  });

  it('still draws when both rows are gone', () => {
    const appearance = appearanceFor(null, null);
    expect(appearance.color).toBe(UNRATED_COLOR);
    expect(appearance.icon.iconName).toBe('mountain');
  });
});

/**
 * How a trail's rating and kind decide what it looks like.
 *
 * Colour and icon are derived on read rather than stored per trail, which is
 * what makes recolouring a grade in the admin repaint every trail carrying it —
 * a stored colour would need a migration over every row instead.
 *
 * Kept apart from `trails.ts` because that module is `server-only` and this is
 * the part with the actual rules in it. Structural parameter types rather than
 * the generated `TrailRating`/`TrailKind` so the rules can be exercised without
 * standing up Payload.
 */
import { UNRATED_COLOR } from '@/data/trail-metadata';
import { iconForKind, UNRATED_VALUE } from '@/data/trail-vocabulary';
import type { IconDefinition } from '@fortawesome/free-solid-svg-icons';

/** As much of a `trail-ratings` row as appearance depends on. */
export interface RatingRow {
  color?: null | string;
  value?: null | string;
}

/** As much of a `trail-kinds` row as appearance depends on. */
export interface KindRow {
  color?: null | string;
  icon?: null | string;
}

export interface TrailAppearance {
  color: string;
  icon: IconDefinition;
  /** The rating's stable key, with 'unrated' flattened to the app's ''. */
  rating: string;
}

/**
 * Every branch here answers with something drawable, deliberately.
 *
 * `getCityTrails` must never throw, and a trail whose rating row was deleted —
 * the relationship is `ON DELETE set null` — would otherwise reach the map with
 * no colour at all and vanish into the basemap. A grey line that is visibly
 * ungraded is a far better failure than an invisible one.
 */
export function appearanceFor(
  rating: null | RatingRow | undefined,
  kind: null | KindRow | undefined,
): TrailAppearance {
  const value = rating?.value ?? '';
  return {
    // The kind wins when it sets one — that is how greenways come out green
    // whatever their difficulty — and difficulty decides otherwise.
    color: kind?.color || rating?.color || UNRATED_COLOR,
    icon: iconForKind(kind?.icon),
    rating: value === UNRATED_VALUE ? '' : value,
  };
}

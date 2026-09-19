/**
 * The rating and kind vocabularies a trail is described with.
 *
 * Both used to be hardcoded `select` options on the Trails collection, which
 * meant adding a difficulty band or a new sort of trail was a code change, a
 * migration, and a deploy. They are collections now — `trail-ratings` and
 * `trail-kinds` — so a curator can add, rename, recolour, and reorder them.
 *
 * What stays in code is the *default* vocabulary and the small set of things a
 * database row genuinely can't carry:
 *
 * - **The seed rows.** A trail's rating is a required relationship, so an empty
 *   database would be one you couldn't create a trail in. The migration inserts
 *   these, and the seed scripts fall back to creating them.
 * - **The icons.** A FontAwesome `IconDefinition` is an object, not a value —
 *   it can't round-trip through Postgres. A kind stores an icon *key* and this
 *   maps it back, which also keeps the icon set to ones already bundled.
 * - **The fallbacks.** `getCityTrails` must never throw, so every derived value
 *   needs an answer even when the vocabulary rows are missing or a curator has
 *   left a colour blank.
 *
 * Client-safe: no Node-only imports, so the sidebar can use it too.
 */
import {
  faMountain,
  faRoute,
  type IconDefinition,
} from '@fortawesome/free-solid-svg-icons';
import { RATING_COLORS, UNRATED_COLOR } from './trail-metadata';

/**
 * The rating meaning "nobody has graded this", which the app has always
 * represented as an empty string. Kept as a real row rather than a blank
 * relationship so it can carry a colour like any other.
 */
export const UNRATED_VALUE = 'unrated';

/** The kind a trail is unless someone says otherwise. */
export const DEFAULT_KIND_VALUE = 'trail';

/** Greenways are drawn in their own green regardless of difficulty. */
export const GREENWAY_COLOR = '#059669';

export interface RatingSeed {
  color: string;
  name: string;
  /** Difficulty order, low to high. Drives the admin list and the dropdown. */
  sortOrder: number;
  value: string;
}

/**
 * The icon keys a kind may hold. Narrow rather than `string` so it lines up
 * with the select's generated type — the options below are what Payload
 * generates that union from.
 */
export type KindIcon = 'mountain' | 'route';

export interface KindSeed {
  /** Overrides the rating's colour when set — how greenways get their green. */
  color?: string;
  icon: KindIcon;
  name: string;
  value: string;
}

/**
 * The five difficulty bands, in the order a rider would rank them.
 *
 * Colours come from `RATING_COLORS` rather than being repeated, so the checked-
 * in palette and the seeded one cannot drift apart.
 */
export const DEFAULT_RATINGS: RatingSeed[] = [
  { color: RATING_COLORS.easy, name: 'Easy', sortOrder: 1, value: 'easy' },
  {
    color: RATING_COLORS.intermediate,
    name: 'Intermediate',
    sortOrder: 2,
    value: 'intermediate',
  },
  {
    color: RATING_COLORS.advanced,
    name: 'Advanced',
    sortOrder: 3,
    value: 'advanced',
  },
  {
    color: RATING_COLORS.expert,
    name: 'Expert',
    sortOrder: 4,
    value: 'expert',
  },
  {
    color: UNRATED_COLOR,
    name: 'Unrated',
    // Last on purpose: it is not harder than Expert, it is the absence of a
    // grade, and it should sit at the bottom of the list rather than mid-scale.
    sortOrder: 99,
    value: UNRATED_VALUE,
  },
];

export const DEFAULT_KINDS: KindSeed[] = [
  { icon: 'mountain', name: 'Singletrack trail', value: DEFAULT_KIND_VALUE },
  {
    color: GREENWAY_COLOR,
    icon: 'route',
    name: 'Greenway',
    value: 'greenway',
  },
];

/**
 * Icons a kind may use, keyed by the value stored on the row.
 *
 * Deliberately a short list. The project's rule is to use the icon libraries
 * already bundled rather than adding more, and an open text field inviting any
 * FontAwesome name would mostly produce icons that don't exist.
 */
export const KIND_ICONS: Record<KindIcon, IconDefinition> = {
  mountain: faMountain,
  route: faRoute,
};

/** The icon options, for the `kind.icon` select in the admin. */
export const KIND_ICON_OPTIONS: { label: string; value: KindIcon }[] = [
  { label: 'Mountain — singletrack', value: 'mountain' },
  { label: 'Route — greenway, paved path', value: 'route' },
];

/**
 * The icon a kind draws with, falling back to singletrack's.
 *
 * Takes a loose `string` on purpose: it is fed whatever the database holds, and
 * a kind row that predates an icon being renamed should still render something.
 */
export function iconForKind(icon: string | null | undefined): IconDefinition {
  return KIND_ICONS[icon as KindIcon] ?? faMountain;
}

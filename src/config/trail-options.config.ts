/**
 * Code-owned trail vocabularies.
 *
 * The database keeps matching rows because trails and condition reports use
 * relationships for referential integrity. These arrays are authoritative:
 * change them here, then ship the corresponding seed/migration. They are not
 * editable lists in the admin UI.
 */
import { RATING_COLORS, UNRATED_COLOR } from '@/data/trail-metadata';

export interface TrailDifficultyOption {
  color: string;
  name: string;
  /** Difficulty order, low to high. */
  sortOrder: number;
  value: string;
}

export interface TrailConditionOption {
  color: string;
  description?: string;
  /** Draws the trail closed on the map, and stops the badge expiring. */
  marksClosed?: boolean;
  name: string;
  /** Best-to-worst order. */
  sortOrder: number;
  value: string;
}

export const UNRATED_DIFFICULTY_VALUE = 'unrated';

export const TRAIL_DIFFICULTY_OPTIONS: TrailDifficultyOption[] = [
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
    sortOrder: 99,
    value: UNRATED_DIFFICULTY_VALUE,
  },
];

export const TRAIL_CONDITION_OPTIONS: TrailConditionOption[] = [
  {
    color: '#059669',
    description: 'Damp, grippy dirt. As good as it gets.',
    name: 'Prime / tacky',
    sortOrder: 10,
    value: 'tacky',
  },
  {
    color: '#16a34a',
    description: 'Dry and fast, no surprises.',
    name: 'Dry',
    sortOrder: 20,
    value: 'dry',
  },
  {
    color: '#ca8a04',
    description:
      'Dry to the point of loose corners and blown-out braking bumps.',
    name: 'Dusty / loose',
    sortOrder: 30,
    value: 'dusty',
  },
  {
    color: '#2563eb',
    description: 'Wet but holding up — rideable without damaging the tread.',
    name: 'Wet',
    sortOrder: 40,
    value: 'wet',
  },
  {
    color: '#b45309',
    description: 'Soft enough to rut. Please stay off until it dries.',
    name: 'Muddy — stay off',
    sortOrder: 50,
    value: 'muddy',
  },
  {
    color: '#0ea5e9',
    description:
      'Snow-covered or frozen. Fine when frozen hard, ruinous when soft.',
    name: 'Snow / ice',
    sortOrder: 60,
    value: 'snow',
  },
  {
    color: '#dc2626',
    description: 'Closed by the land manager, or blocked. Do not ride.',
    marksClosed: true,
    name: 'Closed',
    sortOrder: 70,
    value: 'closed',
  },
];

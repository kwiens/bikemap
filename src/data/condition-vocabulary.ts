/**
 * The default condition vocabulary, seeded by the migration and by the seed
 * scripts. Curated in the admin after that.
 *
 * These stay in code because a report's condition is a required relationship —
 * an empty table is one nobody can file a report against.
 *
 * Client-safe: no Node-only imports.
 */

/**
 * How long a report keeps driving the badge. Past this it stays in history but
 * stops being shown as the current answer.
 */
export const CONDITION_FRESH_DAYS = 14;

export interface ConditionSeed {
  /** The colour the badge pill is tinted with. */
  color: string;
  description?: string;
  /** Draws the trail closed on the map, and stops the badge expiring. */
  marksClosed?: boolean;
  name: string;
  /** Best-to-worst order. Drives the admin list and the report dropdown. */
  sortOrder: number;
  /** The stable key matched on in code. */
  value: string;
}

/** Ordered best to worst — this is the order of the rider's dropdown. */
export const DEFAULT_CONDITIONS: ConditionSeed[] = [
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

/** The colour a condition falls back to if a curator has blanked its own. */
export const DEFAULT_CONDITION_COLOR = '#6b7280';

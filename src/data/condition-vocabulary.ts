/**
 * Runtime condition constants. The options themselves live in the trail
 * configuration so forks have one obvious place to change them.
 *
 * Client-safe: no Node-only imports.
 */

/**
 * How long a report keeps driving the badge. Past this it stays in history but
 * stops being shown as the current answer.
 */
export const CONDITION_FRESH_DAYS = 14;

export { TRAIL_CONDITION_OPTIONS as DEFAULT_CONDITIONS } from '@/config/trail-options.config';

/** The colour a condition falls back to if a curator has blanked its own. */
export const DEFAULT_CONDITION_COLOR = '#6b7280';

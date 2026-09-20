// Rating-to-color mapping (shared with MTB trail color expression)
export const RATING_COLORS: Record<string, string> = {
  easy: '#16A34A',
  intermediate: '#2563EB',
  advanced: '#374151',
  expert: '#000000',
};

export const UNRATED_COLOR = '#6B7280';

export const GREENWAY_COLOR = '#059669';

// Single source of truth for a trail's line color; the per-city trail data
// files derive their `color` field from this.
export function trailColor(rating: string, isGreenway = false): string {
  if (isGreenway) return GREENWAY_COLOR;
  return RATING_COLORS[rating] ?? UNRATED_COLOR;
}

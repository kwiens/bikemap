// Maps raw Mapbox feature property values to trail metadata.
// Used to augment tileset data that lacks rating or uses raw GIS names.
// Key: raw feature Name/Trail value from the Mapbox layer
// Value: { displayName, rating }

export interface TrailMeta {
  displayName: string;
  rating: 'easy' | 'intermediate' | 'advanced' | 'expert' | '';
}

export const TRAIL_METADATA: Record<string, TrailMeta> = {
  // Godsey Ridge Trails (layer: "Godsey Ridge Trails", prop: "Name")
  'Green as built': {
    displayName: 'Godsey Ridge Green',
    rating: 'easy',
  },
  'Blue as built 1': {
    displayName: 'Godsey Ridge Blue 1',
    rating: 'intermediate',
  },
  'Blue as built 2': {
    displayName: 'Godsey Ridge Blue 2',
    rating: 'intermediate',
  },
  Exper_Spur_As_built_21626: {
    displayName: 'Godsey Ridge Expert Spur',
    rating: 'expert',
  },
  Expert_As_Built_1: {
    displayName: 'Godsey Ridge Expert 1',
    rating: 'expert',
  },
  Expert_As_Built_2: {
    displayName: 'Godsey Ridge Expert 2',
    rating: 'expert',
  },
};

// Rating-to-color mapping (shared with SORBA color expression)
export const RATING_COLORS: Record<string, string> = {
  easy: '#16A34A',
  intermediate: '#2563EB',
  advanced: '#374151',
  expert: '#000000',
};

export const UNRATED_COLOR = '#6B7280';

import type { IconDefinition } from '@fortawesome/free-solid-svg-icons';
import type { OsmTrailDetails } from './osm-trails';

// MTB trails tileset. The Mapbox Studio style no longer references this
// tileset, so we add it ourselves at runtime (see ensureMtnBikeSource).
// MTN_BIKE_SOURCE_LAYER and MTN_BIKE_TILESET_URL must match the current
// tileset on Mapbox Studio; the source/layer ids are our own.
export const MTN_BIKE_LAYER_ID = 'mtb-trails';
export const MTN_BIKE_SOURCE_LAYER = 'Chattanooga_Regional_Trails_4-dhs2zs';
export const MTN_BIKE_TILESET_URL = 'mapbox://swuller.ccfw1cmr';
export const MTN_BIKE_SOURCE_ID = 'mtb-trails-source';

export const GODSEY_LAYER_ID = 'Godsey Ridge Trails';
export const GODSEY_SOURCE_LAYER = 'LineStrings';

// Mountain Bike Trails Interface and Data
export interface MountainBikeTrail {
  trailName: string; // Trail property value from Mapbox features
  displayName: string; // Human-friendly display name
  recArea: string; // Recreation area grouping
  rating: string; // "easy" | "intermediate" | "advanced" | "expert" | ""
  color: string; // Display color
  icon: IconDefinition;
  distance?: number; // Trail length in miles
  elevationGain?: number; // Total climbing in feet
  elevationLoss?: number; // Total descending in feet
  elevationMin?: number; // Lowest point in feet
  elevationMax?: number; // Highest point in feet
  defaultBounds?: [number, number, number, number]; // [swLng, swLat, neLng, neLat]
  bounds?: mapboxgl.LngLatBounds;
}

export interface ElevationProfile {
  trail: string;
  distance: number; // Total distance in feet
  gain: number;
  loss: number;
  min: number;
  max: number;
  profile: [number, number, number, number][]; // [distance_ft, elevation_ft, lng, lat]
  // OSM trails only: a tiny tag summary shown beneath the pane header. Curated
  // trails and recorded rides leave this undefined.
  osm?: OsmTrailDetails;
}

// Maps recArea to its geographic region
const REGION_MAP: Record<string, string> = {
  '5 Points': 'Lookout Mountain',
  Durham: 'Lookout Mountain',
  'Lula Lake': 'Lookout Mountain',
  'Lookout Mountain': 'Lookout Mountain',
  'Cloudland Canyon State Park': 'Lookout Mountain',
  "Walden's Ridge Park": 'North Shore & Red Bank',
  'Stringers Ridge': 'North Shore & Red Bank',
  'Greenway Farms': 'North Shore & Red Bank',
  'Raccoon Mountain': 'Raccoon Mountain',
  'White Oak Mountain': 'East Chattanooga',
  'Enterprise South': 'East Chattanooga',
  'Collegedale Greenways': 'East Chattanooga',
  'Booker T Washington State Park': 'East Chattanooga',
  'Harrison Bay State Park': 'East Chattanooga',
  'Chattanooga Greenways': 'Urban Chattanooga',
  'Houston Valley': 'Northwest Georgia',
  'Chickamauga Battlefield National Military Park': 'Northwest Georgia',
  Ringgold: 'Northwest Georgia',
  Cleveland: 'Cleveland',
  'Godsey Ridge': 'North Shore & Red Bank',
};

export function regionFor(recArea: string): string {
  return REGION_MAP[recArea] ?? 'Other';
}

// The ~3,000-line trail data array lives in mountain-bike-trails.data.ts so
// this module stays readable. The scripts in scripts/ edit that data file.
export { mountainBikeTrails } from './mountain-bike-trails.data';

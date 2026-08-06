/**
 * Unit conversions for trail measurements.
 *
 * The app stores trail distance in miles and elevation in feet (matching
 * src/data/mountain-bike-trails.data.ts and public/data/elevation/*.json),
 * while everything upstream — OSM, the terrain DEM, and ride-stats — works in
 * meters. These are the only two places that boundary is crossed.
 */

export const METERS_TO_MILES = 1 / 1609.344;
export const M_TO_FT = 3.280839895;

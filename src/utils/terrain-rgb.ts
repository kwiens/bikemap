// Shared Mapbox Terrain-RGB primitives used by the elevation samplers:
// dem.ts (pre-cached local z13 tiles for ride correction) and osm-elevation.ts
// (live API tiles for the OSM trail pane), and payload/osm/terrain.ts
// (the server-side trail editor). Each keeps its own tile fetch +
// cache — only the encoding and the Web Mercator tile math are shared.

export const TERRAIN_TILE_SIZE = 256;
export const OSM_TERRAIN_ZOOM = 14;
const MAX_MERCATOR_LAT = 85.05112878;

/** Decode a Terrain-RGB pixel to elevation in meters. */
export function decodeTerrainRgb(r: number, g: number, b: number): number {
  return -10000 + (r * 65536 + g * 256 + b) * 0.1;
}

export interface TilePixel {
  x: number; // tile column
  y: number; // tile row
  px: number; // pixel column within the tile
  py: number; // pixel row within the tile
}

/** Convert lng/lat to tile coordinates + pixel offset at the given zoom. */
export function lngLatToTilePixel(
  lng: number,
  lat: number,
  zoom: number,
): TilePixel {
  const scale = TERRAIN_TILE_SIZE * 2 ** zoom;
  const clampWorld = (pixel: number) =>
    Math.min(scale - 1, Math.max(0, Math.floor(pixel)));
  const worldX = clampWorld(((lng + 180) / 360) * scale);
  const mercatorLat = Math.max(
    -MAX_MERCATOR_LAT,
    Math.min(MAX_MERCATOR_LAT, lat),
  );
  const sinLat = Math.sin((mercatorLat * Math.PI) / 180);
  const worldY = clampWorld(
    (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale,
  );
  const x = Math.floor(worldX / TERRAIN_TILE_SIZE);
  const y = Math.floor(worldY / TERRAIN_TILE_SIZE);
  return {
    x,
    y,
    px: worldX % TERRAIN_TILE_SIZE,
    py: worldY % TERRAIN_TILE_SIZE,
  };
}

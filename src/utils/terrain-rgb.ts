// Shared Mapbox Terrain-RGB primitives used by both elevation samplers:
// dem.ts (pre-cached local z13 tiles for ride correction) and osm-elevation.ts
// (live z14 API tiles for the OSM trail pane). Each keeps its own tile fetch +
// cache — only the encoding and the Web Mercator tile math are shared.

export const TERRAIN_TILE_SIZE = 256;

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
  const worldX = ((lng + 180) / 360) * scale;
  const sinLat = Math.sin((lat * Math.PI) / 180);
  const worldY =
    (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale;
  const x = Math.floor(worldX / TERRAIN_TILE_SIZE);
  const y = Math.floor(worldY / TERRAIN_TILE_SIZE);
  const clamp = (v: number) => Math.min(TERRAIN_TILE_SIZE - 1, Math.max(0, v));
  return {
    x,
    y,
    px: clamp(Math.floor(worldX) - x * TERRAIN_TILE_SIZE),
    py: clamp(Math.floor(worldY) - y * TERRAIN_TILE_SIZE),
  };
}

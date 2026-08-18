/**
 * Client-side DEM elevation correction using pre-cached Mapbox Terrain-RGB tiles.
 *
 * Tiles are stored in /public/terrain/{z}/{x}/{y}.png and encode elevation as:
 *   height = -10000 + (R * 65536 + G * 256 + B) * 0.1
 *
 * The tile set covers the greater Chattanooga area at z13 (256px, ~16m/pixel).
 */

import {
  TERRAIN_TILE_SIZE as TILE_SIZE,
  decodeTerrainRgb,
  lngLatToTilePixel,
} from './terrain-rgb';

const TILE_ZOOM = 13;

// Cache loaded tile image data to avoid re-fetching
const tileCache = new Map<string, ImageData | null>();

/** Load a terrain tile and return its ImageData, or null if unavailable */
async function loadTile(
  tileX: number,
  tileY: number,
): Promise<ImageData | null> {
  const key = `${tileX}/${tileY}`;
  const cached = tileCache.get(key);
  if (cached !== undefined) return cached;

  try {
    const url = `/terrain/${TILE_ZOOM}/${tileX}/${tileY}.png`;
    const resp = await fetch(url);
    if (!resp.ok) {
      tileCache.set(key, null);
      return null;
    }

    const blob = await resp.blob();
    const bitmap = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(TILE_SIZE, TILE_SIZE);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      tileCache.set(key, null);
      return null;
    }
    ctx.drawImage(bitmap, 0, 0);
    const imageData = ctx.getImageData(0, 0, TILE_SIZE, TILE_SIZE);
    tileCache.set(key, imageData);
    return imageData;
  } catch {
    tileCache.set(key, null);
    return null;
  }
}

/** Get DEM elevation at a single lat/lng point, or null if tile unavailable */
export async function getElevation(
  lat: number,
  lng: number,
): Promise<number | null> {
  const { x, y, px, py } = lngLatToTilePixel(lng, lat, TILE_ZOOM);
  const tile = await loadTile(x, y);
  if (!tile) return null;

  const idx = (py * TILE_SIZE + px) * 4;
  return decodeTerrainRgb(
    tile.data[idx],
    tile.data[idx + 1],
    tile.data[idx + 2],
  );
}

/**
 * Correct altitude for an array of ride points using DEM elevation.
 *
 * Returns two arrays (original points are not modified):
 * - `corrected`: every point with DEM altitude replacing GPS altitude
 *   (same length as input — use for storage and display)
 * - `deduplicated`: consecutive points on the same DEM pixel collapsed
 *   into one (use only for elevation stats computation)
 *
 * Points outside the cached tile area keep their GPS altitude.
 */
export async function correctElevations<
  T extends {
    lat: number;
    lng: number;
    altitude: number | null;
    segmentStart?: boolean;
  },
>(points: T[]): Promise<{ corrected: T[]; deduplicated: T[] }> {
  // Pre-load all needed tiles in parallel
  const tileKeys = new Set<string>();
  for (const p of points) {
    const { x, y } = lngLatToTilePixel(p.lng, p.lat, TILE_ZOOM);
    tileKeys.add(`${x}/${y}`);
  }

  await Promise.all(
    [...tileKeys].map((key) => {
      const [x, y] = key.split('/').map(Number);
      return loadTile(x, y);
    }),
  );

  const corrected: T[] = [];
  const deduplicated: T[] = [];
  let prevKey: string | null = null;

  for (const p of points) {
    const { x, y, px, py } = lngLatToTilePixel(p.lng, p.lat, TILE_ZOOM);
    const tile = tileCache.get(`${x}/${y}`);

    let fixed: T;
    let key: string;
    if (tile) {
      const idx = (py * TILE_SIZE + px) * 4;
      const demAlt = decodeTerrainRgb(
        tile.data[idx],
        tile.data[idx + 1],
        tile.data[idx + 2],
      );
      fixed = { ...p, altitude: demAlt };
      key = `${x}/${y}/${px}/${py}`;
    } else {
      fixed = p;
      key = `gps/${corrected.length}`; // unique — never dedup GPS-only points
    }

    corrected.push(fixed);

    // Collapse consecutive points on the same DEM pixel
    if (key !== prevKey || p.segmentStart) {
      deduplicated.push(fixed);
      prevKey = key;
    }
  }

  return { corrected, deduplicated };
}

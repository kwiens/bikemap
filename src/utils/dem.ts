/**
 * Client-side DEM elevation correction using pre-cached Mapbox Terrain-RGB tiles.
 *
 * Tiles are stored in /public/terrain/{z}/{x}/{y}.png and encode elevation as:
 *   height = -10000 + (R * 65536 + G * 256 + B) * 0.1
 *
 * The tile set covers the greater Chattanooga area at z13 (256px, ~16m/pixel).
 */

const TILE_ZOOM = 13;
const TILE_SIZE = 256;

/** Convert lat/lng to tile coordinates and pixel offset within the tile */
function latLngToTilePixel(
  lat: number,
  lng: number,
): { tileX: number; tileY: number; pixelX: number; pixelY: number } {
  const n = 2 ** TILE_ZOOM;
  const xFloat = ((lng + 180) / 360) * n;
  const latRad = (lat * Math.PI) / 180;
  const yFloat =
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;

  const tileX = Math.floor(xFloat);
  const tileY = Math.floor(yFloat);
  const pixelX = Math.floor((xFloat - tileX) * TILE_SIZE);
  const pixelY = Math.floor((yFloat - tileY) * TILE_SIZE);

  return { tileX, tileY, pixelX, pixelY };
}

/** Decode elevation from Terrain-RGB pixel values */
function decodeElevation(r: number, g: number, b: number): number {
  return -10000 + (r * 65536 + g * 256 + b) * 0.1;
}

// Cache loaded tile image data to avoid re-fetching
const tileCache = new Map<string, ImageData | null>();

/** Load a terrain tile and return its ImageData, or null if unavailable */
async function loadTile(
  tileX: number,
  tileY: number,
): Promise<ImageData | null> {
  const key = `${tileX}/${tileY}`;
  if (tileCache.has(key)) return tileCache.get(key)!;

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
    const ctx = canvas.getContext('2d')!;
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
  const { tileX, tileY, pixelX, pixelY } = latLngToTilePixel(lat, lng);
  const tile = await loadTile(tileX, tileY);
  if (!tile) return null;

  const idx = (pixelY * TILE_SIZE + pixelX) * 4;
  return decodeElevation(
    tile.data[idx],
    tile.data[idx + 1],
    tile.data[idx + 2],
  );
}

/**
 * Correct altitude for an array of ride points using DEM elevation.
 * Returns a new array with corrected altitudes (original points are not modified).
 * Points outside the cached tile area keep their GPS altitude.
 */
export async function correctElevations<
  T extends { lat: number; lng: number; altitude: number | null },
>(points: T[]): Promise<T[]> {
  // Pre-load all needed tiles in parallel
  const tileKeys = new Set<string>();
  for (const p of points) {
    const { tileX, tileY } = latLngToTilePixel(p.lat, p.lng);
    tileKeys.add(`${tileX}/${tileY}`);
  }

  await Promise.all(
    [...tileKeys].map((key) => {
      const [x, y] = key.split('/').map(Number);
      return loadTile(x, y);
    }),
  );

  // Correct each point
  return points.map((p) => {
    const { tileX, tileY, pixelX, pixelY } = latLngToTilePixel(p.lat, p.lng);
    const tile = tileCache.get(`${tileX}/${tileY}`);
    if (!tile) return p;

    const idx = (pixelY * TILE_SIZE + pixelX) * 4;
    const demAlt = decodeElevation(
      tile.data[idx],
      tile.data[idx + 1],
      tile.data[idx + 2],
    );

    return { ...p, altitude: demAlt };
  });
}

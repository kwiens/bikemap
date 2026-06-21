// Client-side elevation + length for nationwide OSM trails.
//
// OSM trail tiles carry no length or elevation, so we derive both from the
// clicked way's geometry: length via haversine, elevation by sampling Mapbox
// Terrain-RGB tiles (the same DEM the curated-trail elevation script uses) and
// running the samples through the shared smoothed gain/loss computation. Values
// are approximate — vector-tile geometry is simplified and tile-clipped.

import {
  haversineDistance,
  computeElevation,
  pointsToElevationProfile,
} from './ride-stats';
import type { ElevationProfile } from '../data/mountain-bike-trails';

const TERRAIN_ZOOM = 14;
const TILE_SIZE = 256;
// Resample segments to roughly the DEM resolution so gain isn't undercounted
// between sparse vector-tile vertices.
const SAMPLE_STEP_M = 20;

export interface ElevationStats {
  gain: number; // meters
  loss: number;
  min: number;
  max: number;
}

/** Total length (meters) of a set of polylines of [lng, lat] coordinates. */
export function traceLengthMeters(lines: [number, number][][]): number {
  let total = 0;
  for (const line of lines) {
    for (let i = 1; i < line.length; i++) {
      total += haversineDistance(
        line[i - 1][1],
        line[i - 1][0],
        line[i][1],
        line[i][0],
      );
    }
  }
  return total;
}

/** Decode a Mapbox Terrain-RGB pixel to elevation in meters. */
export function decodeTerrainRgb(r: number, g: number, b: number): number {
  return -10000 + (r * 65536 + g * 256 + b) * 0.1;
}

/** Insert intermediate points so no gap exceeds ~SAMPLE_STEP_M. */
export function densifyLine(
  line: [number, number][],
  stepMeters = SAMPLE_STEP_M,
): [number, number][] {
  if (line.length < 2) return line.slice();
  const out: [number, number][] = [line[0]];
  for (let i = 1; i < line.length; i++) {
    const [lng1, lat1] = line[i - 1];
    const [lng2, lat2] = line[i];
    const dist = haversineDistance(lat1, lng1, lat2, lng2);
    const steps = Math.max(1, Math.floor(dist / stepMeters));
    for (let k = 1; k <= steps; k++) {
      const t = k / steps;
      out.push([lng1 + (lng2 - lng1) * t, lat1 + (lat2 - lat1) * t]);
    }
  }
  return out;
}

interface TilePixel {
  x: number;
  y: number;
  px: number;
  py: number;
}

function lngLatToTilePixel(lng: number, lat: number, z: number): TilePixel {
  const scale = TILE_SIZE * 2 ** z;
  const worldX = ((lng + 180) / 360) * scale;
  const sinLat = Math.sin((lat * Math.PI) / 180);
  const worldY =
    (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale;
  const x = Math.floor(worldX / TILE_SIZE);
  const y = Math.floor(worldY / TILE_SIZE);
  const clamp = (v: number) => Math.min(TILE_SIZE - 1, Math.max(0, v));
  return {
    x,
    y,
    px: clamp(Math.floor(worldX) - x * TILE_SIZE),
    py: clamp(Math.floor(worldY) - y * TILE_SIZE),
  };
}

// Decoded terrain tiles persist across popups (module-level cache).
const tileCache = new Map<string, Promise<ImageData | null>>();

function loadTerrainTile(
  x: number,
  y: number,
  z: number,
  token: string,
): Promise<ImageData | null> {
  const key = `${z}/${x}/${y}`;
  const cached = tileCache.get(key);
  if (cached) return cached;

  const promise = new Promise<ImageData | null>((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = TILE_SIZE;
        canvas.height = TILE_SIZE;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0);
        resolve(ctx.getImageData(0, 0, TILE_SIZE, TILE_SIZE));
      } catch {
        resolve(null); // tainted canvas / decode failure
      }
    };
    img.onerror = () => resolve(null);
    img.src = `https://api.mapbox.com/v4/mapbox.terrain-rgb/${z}/${x}/${y}.pngraw?access_token=${token}`;
  });

  tileCache.set(key, promise);
  return promise;
}

/**
 * Sample Mapbox Terrain-RGB along the given polylines and return smoothed
 * gain/loss/min/max (meters), or null if no terrain could be read.
 */
export async function sampleTrailElevation(
  lines: [number, number][][],
  token: string,
): Promise<ElevationStats | null> {
  const densified = lines
    .map((line) => densifyLine(line))
    .filter((line) => line.length >= 2);
  if (!densified.length) return null;

  // Collect the distinct terrain tiles we need, then fetch them once each.
  const needed = new Map<string, { x: number; y: number }>();
  for (const line of densified) {
    for (const [lng, lat] of line) {
      const tp = lngLatToTilePixel(lng, lat, TERRAIN_ZOOM);
      needed.set(`${tp.x}/${tp.y}`, { x: tp.x, y: tp.y });
    }
  }
  const tiles = new Map<string, ImageData | null>();
  await Promise.all(
    [...needed].map(async ([key, { x, y }]) => {
      tiles.set(key, await loadTerrainTile(x, y, TERRAIN_ZOOM, token));
    }),
  );

  const elevationAt = (lng: number, lat: number): number | null => {
    const tp = lngLatToTilePixel(lng, lat, TERRAIN_ZOOM);
    const img = tiles.get(`${tp.x}/${tp.y}`);
    if (!img) return null;
    const o = (tp.py * TILE_SIZE + tp.px) * 4;
    return decodeTerrainRgb(img.data[o], img.data[o + 1], img.data[o + 2]);
  };

  // Aggregate per line so clipped-segment seams don't fabricate gain/loss.
  let gain = 0;
  let loss = 0;
  let min = Infinity;
  let max = -Infinity;
  let sampled = false;

  for (const line of densified) {
    const points = line.map(([lng, lat]) => ({
      lng,
      lat,
      altitude: elevationAt(lng, lat),
      timestamp: 0,
    }));
    if (!points.some((p) => p.altitude !== null)) continue;
    sampled = true;
    const e = computeElevation(points);
    gain += e.gain;
    loss += e.loss;
    min = Math.min(min, e.min);
    max = Math.max(max, e.max);
  }

  if (!sampled) return null;
  return {
    gain,
    loss,
    min: min === Infinity ? 0 : min,
    max: max === -Infinity ? 0 : max,
  };
}

// --- Full profile for the elevation pane -------------------------------------
//
// The popup summary can use precomputed stats, but the elevation *pane* needs a
// per-point profile (distance + elevation along the trail), which precompute
// doesn't store — so the pane always samples terrain in real time here.

// Two coordinates within this distance are treated as the same endpoint when
// stitching tile-clipped segments back into one ordered path.
const STITCH_TOLERANCE_M = 12;

function near(a: [number, number], b: [number, number]): boolean {
  return haversineDistance(a[1], a[0], b[1], b[0]) <= STITCH_TOLERANCE_M;
}

/**
 * Stitch tile-clipped way segments into a single ordered coordinate path by
 * greedily matching endpoints. Disconnected leftovers (rare) are dropped.
 */
export function stitchLines(lines: [number, number][][]): [number, number][] {
  const segments = lines.filter((l) => l.length >= 2).map((l) => l.slice());
  if (segments.length === 0) return lines[0]?.slice() ?? [];

  const path = segments.shift() as [number, number][];
  let progress = true;
  while (segments.length > 0 && progress) {
    progress = false;
    const head = path[0];
    const tail = path[path.length - 1];
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const s0 = seg[0];
      const s1 = seg[seg.length - 1];
      if (near(tail, s0)) path.push(...seg.slice(1));
      else if (near(tail, s1)) path.push(...seg.slice(0, -1).reverse());
      else if (near(head, s1)) path.unshift(...seg.slice(0, -1));
      else if (near(head, s0)) path.unshift(...seg.slice(1).reverse());
      else continue;
      segments.splice(i, 1);
      progress = true;
      break;
    }
  }
  return path;
}

/** Sample DEM elevation (meters) at each coordinate; null where unavailable. */
async function sampleElevations(
  coords: [number, number][],
  token: string,
): Promise<(number | null)[]> {
  const needed = new Map<string, { x: number; y: number }>();
  for (const [lng, lat] of coords) {
    const tp = lngLatToTilePixel(lng, lat, TERRAIN_ZOOM);
    needed.set(`${tp.x}/${tp.y}`, { x: tp.x, y: tp.y });
  }
  const tiles = new Map<string, ImageData | null>();
  await Promise.all(
    [...needed].map(async ([key, { x, y }]) => {
      tiles.set(key, await loadTerrainTile(x, y, TERRAIN_ZOOM, token));
    }),
  );

  return coords.map(([lng, lat]) => {
    const tp = lngLatToTilePixel(lng, lat, TERRAIN_ZOOM);
    const img = tiles.get(`${tp.x}/${tp.y}`);
    if (!img) return null;
    const o = (tp.py * TILE_SIZE + tp.px) * 4;
    return decodeTerrainRgb(img.data[o], img.data[o + 1], img.data[o + 2]);
  });
}

/**
 * Build an elevation profile (feet, via the shared ride-stats builder) for an
 * OSM way's geometry by sampling the terrain DEM for the chart shape. Returns
 * null when the trail is too short or no terrain could be read.
 *
 * Supports both calculation paths: the per-point profile always comes from
 * real-time sampling (precompute stores no points), but when `precomputed`
 * stats are supplied they drive the headline distance/gain/loss/min/max so the
 * pane shows the more accurate offline totals.
 */
export async function buildOsmElevationProfile(
  lines: [number, number][][],
  name: string,
  token: string,
  precomputed?: PrecomputedElevation | null,
): Promise<ElevationProfile | null> {
  const path = densifyLine(stitchLines(lines));
  if (path.length < 5) return null;

  const elevations = await sampleElevations(path, token);
  const points = path.map(([lng, lat], i) => ({
    lng,
    lat,
    altitude: elevations[i],
  }));

  const stats = precomputed
    ? {
        distance: precomputed.lengthMeters,
        elevationGain: precomputed.elevation.gain,
        elevationLoss: precomputed.elevation.loss,
        elevationMin: precomputed.elevation.min,
        elevationMax: precomputed.elevation.max,
      }
    : undefined;
  return pointsToElevationProfile(points, name, stats);
}

// --- Precomputed elevation (scripts/osm_trail_elevation.py) ------------------
//
// Sampling terrain on every click is wasteful when we can do it once offline.
// The batch tool writes one file per region (US state today, nationwide later),
// keyed by OSM way id, plus a manifest of region bboxes. On click we look up the
// way id in whatever region covers the clicked point; misses fall back to the
// on-demand sampleTrailElevation above.

const PRECOMPUTED_BASE = '/data/osm-elevation';

export interface PrecomputedElevation {
  lengthMeters: number;
  elevation: ElevationStats; // min/max included for future use
}

// bbox is [minLng, minLat, maxLng, maxLat] — matches the tool's output.
interface RegionManifestEntry {
  region: string;
  name: string;
  bbox: [number, number, number, number];
  file: string;
}

let manifestPromise: Promise<RegionManifestEntry[]> | null = null;
// region key → its decoded { osmId → metrics } map (or null if the file 404s).
const regionPromises = new Map<
  string,
  Promise<Map<string, PrecomputedElevation> | null>
>();

function loadManifest(): Promise<RegionManifestEntry[]> {
  if (!manifestPromise) {
    manifestPromise = fetch(`${PRECOMPUTED_BASE}/index.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => (j?.regions ?? []) as RegionManifestEntry[])
      .catch(() => []);
  }
  return manifestPromise;
}

function loadRegion(
  entry: RegionManifestEntry,
): Promise<Map<string, PrecomputedElevation> | null> {
  const existing = regionPromises.get(entry.region);
  if (existing) return existing;

  const promise = fetch(`${PRECOMPUTED_BASE}/${entry.file}`)
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => {
      const trails = j?.trails as Record<string, number[]> | undefined;
      if (!trails) return null;
      const map = new Map<string, PrecomputedElevation>();
      for (const [id, [lengthMeters, gain, loss, min, max]] of Object.entries(
        trails,
      )) {
        map.set(id, { lengthMeters, elevation: { gain, loss, min, max } });
      }
      return map;
    })
    .catch(() => null);

  regionPromises.set(entry.region, promise);
  return promise;
}

function bboxContains(
  bbox: [number, number, number, number],
  lng: number,
  lat: number,
): boolean {
  return lng >= bbox[0] && lng <= bbox[2] && lat >= bbox[1] && lat <= bbox[3];
}

/**
 * Precomputed length + elevation for an OSM way, or null when we have no data
 * for it (no id, no region covering the point, or a cache miss) — in which case
 * the caller should fall back to sampleTrailElevation. Region bboxes can overlap
 * at padded edges, so every covering region is checked.
 */
export async function lookupPrecomputedElevation(
  osmId: unknown,
  lng: number,
  lat: number,
): Promise<PrecomputedElevation | null> {
  if (osmId == null) return null;
  const key = String(osmId);
  const manifest = await loadManifest();
  for (const entry of manifest) {
    if (!bboxContains(entry.bbox, lng, lat)) continue;
    const region = await loadRegion(entry);
    const hit = region?.get(key);
    if (hit) return hit;
  }
  return null;
}

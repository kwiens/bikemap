/**
 * Server-side terrain sampling from Mapbox Terrain-RGB.
 *
 * The browser version of this (src/utils/osm-elevation.ts) decodes tiles with
 * an `Image` and a canvas, neither of which exists in Node — so tile decoding is
 * reimplemented here on `sharp`. Everything else is deliberately shared: the
 * same tile source, the same zoom, the same RGB decode, and the same downstream
 * `computeElevation` / `pointsToElevationProfile`. A profile built here matches
 * what the client computes for the same line, and what the Python port writes.
 */
import sharp from 'sharp';
import { lengthMeters } from './assemble';
import { decodeTerrainRgb } from '@/utils/osm-elevation';
import { haversineDistance } from '@/utils/ride-stats';

const TERRAIN_ZOOM = 14;
const TILE_SIZE = 256;
/** Resample so climb isn't undercounted between sparse OSM nodes. */
const SAMPLE_STEP_M = 20;
/** Caps the work one save can trigger; longer trails are sampled coarsely. */
const MAX_SAMPLES = 8000;

/** The point shape `pointsToElevationProfile` and `computeElevation` consume. */
export interface TerrainPoint {
  altitude: number | null;
  lat: number;
  lng: number;
}

interface TileRef {
  px: number;
  py: number;
  x: number;
  y: number;
}

function lngLatToTilePixel(lng: number, lat: number, z: number): TileRef {
  const scale = TILE_SIZE * 2 ** z;
  const worldX = ((lng + 180) / 360) * scale;
  const sinLat = Math.sin((lat * Math.PI) / 180);
  const worldY =
    (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale;
  const x = Math.floor(worldX / TILE_SIZE);
  const y = Math.floor(worldY / TILE_SIZE);
  const clamp = (v: number) => Math.min(TILE_SIZE - 1, Math.max(0, v));
  return {
    px: clamp(Math.floor(worldX) - x * TILE_SIZE),
    py: clamp(Math.floor(worldY) - y * TILE_SIZE),
    x,
    y,
  };
}

interface DecodedTile {
  channels: number;
  data: Buffer;
}

/**
 * Process-lifetime tile cache. Trails in one recreation area share tiles, so an
 * editor working through an area mostly hits this after the first save.
 *
 * Only *answers* belong in here. A cached null must mean "the DEM has nothing
 * at this tile", never "the network was unwell once" — the cache outlives every
 * save, so a transient failure left in it would report a trail as having no
 * elevation until the server is restarted, with only measure.ts's warning to
 * say so.
 */
const tileCache = new Map<string, Promise<DecodedTile | null>>();

/** Drops every cached tile. For processes that outlive the data, and tests. */
export function clearTileCache(): void {
  tileCache.clear();
}

async function loadTile(
  x: number,
  y: number,
  token: string,
): Promise<DecodedTile | null> {
  const key = `${TERRAIN_ZOOM}/${x}/${y}`;
  const cached = tileCache.get(key);
  if (cached) {
    return cached;
  }

  const request = (async (): Promise<DecodedTile | null> => {
    const response = await fetch(
      `https://api.mapbox.com/v4/mapbox.terrain-rgb/${TERRAIN_ZOOM}/${x}/${y}.pngraw?access_token=${token}`,
    );
    if (!response.ok) {
      // 404 is the DEM saying there is nothing here — ocean, or outside
      // coverage. That answer is stable, so it caches. Any other status is the
      // service having a moment, and must not be mistaken for an answer.
      if (response.status === 404) {
        return null;
      }
      throw new Error(`Terrain tile ${key} returned HTTP ${response.status}`);
    }
    const { data, info } = await sharp(
      Buffer.from(await response.arrayBuffer()),
    )
      .raw()
      .toBuffer({ resolveWithObject: true });
    return { channels: info.channels, data };
  })();

  // The caller still gets null rather than a throw — a terrain blip shouldn't
  // fail an editor's save, and the affected samples are treated as missing.
  // Dropping the entry on the way past is what lets a later save retry; the
  // identity check keeps a late failure from evicting a newer attempt's entry.
  const settled: Promise<DecodedTile | null> = request.catch(() => {
    if (tileCache.get(key) === settled) {
      tileCache.delete(key);
    }
    return null;
  });

  tileCache.set(key, settled);
  return settled;
}

/** Inserts intermediate points so no gap exceeds roughly the DEM resolution. */
export function densify(
  line: [number, number][],
  stepMeters: number = SAMPLE_STEP_M,
): [number, number][] {
  if (line.length < 2) {
    return [...line];
  }

  const out: [number, number][] = [line[0]];
  for (let i = 1; i < line.length; i++) {
    const [lng1, lat1] = line[i - 1];
    const [lng2, lat2] = line[i];
    const steps = Math.max(
      1,
      Math.floor(haversineDistance(lat1, lng1, lat2, lng2) / stepMeters),
    );
    for (let k = 1; k <= steps; k++) {
      const t = k / steps;
      out.push([lng1 + (lng2 - lng1) * t, lat1 + (lat2 - lat1) * t]);
    }
  }
  return out;
}

/**
 * Samples elevation along one continuous line, densified to the DEM's
 * resolution.
 *
 * The line must be continuous: densification walks straight between successive
 * coordinates, so a line spanning a gap gets samples on ground the trail never
 * touches. Disconnected trails go through {@link sampleTerrainParts}.
 *
 * Returns null when no terrain could be read at all — the caller should report
 * "elevation unavailable" rather than store a flat line implying zero climb.
 */
export async function sampleTerrain(
  line: [number, number][],
  token: string,
  maxSamples: number = MAX_SAMPLES,
): Promise<TerrainPoint[] | null> {
  if (line.length < 2 || !token) {
    return null;
  }

  // Coarsen rather than refuse when a trail is very long.
  const fine = densify(line, SAMPLE_STEP_M);
  const sampled =
    fine.length > maxSamples
      ? densify(line, SAMPLE_STEP_M * Math.ceil(fine.length / maxSamples))
      : fine;

  const needed = new Map<string, { x: number; y: number }>();
  for (const [lng, lat] of sampled) {
    const ref = lngLatToTilePixel(lng, lat, TERRAIN_ZOOM);
    needed.set(`${ref.x}/${ref.y}`, { x: ref.x, y: ref.y });
  }

  const tiles = new Map<string, DecodedTile | null>();
  await Promise.all(
    [...needed].map(async ([key, { x, y }]) => {
      tiles.set(key, await loadTile(x, y, token));
    }),
  );

  let read = 0;
  const points: TerrainPoint[] = sampled.map(([lng, lat]) => {
    const ref = lngLatToTilePixel(lng, lat, TERRAIN_ZOOM);
    const tile = tiles.get(`${ref.x}/${ref.y}`);
    if (!tile) {
      return { altitude: null, lat, lng };
    }
    const offset = (ref.py * TILE_SIZE + ref.px) * tile.channels;
    read += 1;
    return {
      altitude: decodeTerrainRgb(
        tile.data[offset],
        tile.data[offset + 1],
        tile.data[offset + 2],
      ),
      lat,
      lng,
    };
  });

  return read === 0 ? null : points;
}

/**
 * Samples each part of a disconnected trail on its own.
 *
 * A trail in two pieces has terrain between them that the trail never crosses —
 * a valley, or the far side of a ridge. Sampling the parts as one line walks
 * that ground and books its descent and climb as the trail's own, so parts are
 * kept apart here and only combined once each has been measured.
 *
 * {@link MAX_SAMPLES} is a budget for the whole trail, split between parts in
 * proportion to their length so every part is sampled at the same resolution
 * and a many-part trail costs no more than a single-part one of equal length.
 *
 * Returns one entry per part that yielded terrain (parts that read nothing are
 * dropped), or null when nothing could be read at all.
 */
export async function sampleTerrainParts(
  parts: [number, number][][],
  token: string,
): Promise<TerrainPoint[][] | null> {
  const usable = parts.filter((part) => part.length >= 2);
  if (usable.length === 0 || !token) {
    return null;
  }

  const lengths = usable.map((part) => lengthMeters([part]));
  const total = lengths.reduce((sum, meters) => sum + meters, 0);

  const sampled: TerrainPoint[][] = [];
  for (const [index, part] of usable.entries()) {
    const share = total > 0 ? lengths[index] / total : 1 / usable.length;
    // Floor of 2: a part shorter than its share of a sample still keeps its own
    // vertices, since `densify` never drops a coordinate.
    const points = await sampleTerrain(
      part,
      token,
      Math.max(2, Math.floor(MAX_SAMPLES * share)),
    );
    if (points) {
      sampled.push(points);
    }
  }

  return sampled.length > 0 ? sampled : null;
}

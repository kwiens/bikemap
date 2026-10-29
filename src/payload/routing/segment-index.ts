import { isPosition, METERS_PER_DEG_LAT, type Position } from './geometry';

/** Bounds both insertions and searches regardless of the geographic extent. */
const MAX_GRID_CELLS = 256;

export interface SegmentIndex {
  grid: Map<string, number[]>;
  unindexedSegments: number[];
  segmentCount: number;
  cellSizeDegrees: number;
}

export function createSegmentIndex(cellSizeDegrees: number): SegmentIndex {
  return {
    grid: new Map(),
    unindexedSegments: [],
    segmentCount: 0,
    cellSizeDegrees,
  };
}

/** Long segments stay available without expanding their entire bounding box. */
export function indexSegment(
  index: SegmentIndex,
  segment: number,
  a: Position,
  b: Position,
): void {
  index.segmentCount = Math.max(index.segmentCount, segment + 1);
  const keys = gridCells(
    index.cellSizeDegrees,
    [Math.min(a[0], b[0]), Math.min(a[1], b[1])],
    [Math.max(a[0], b[0]), Math.max(a[1], b[1])],
  );
  if (!keys) {
    index.unindexedSegments.push(segment);
    return;
  }
  for (const key of keys) {
    const bucket = index.grid.get(key);
    if (bucket) bucket.push(segment);
    else index.grid.set(key, [segment]);
  }
}

/** Nearby candidates, with a bounded-by-graph-size fallback for large searches. */
export function segmentsNear(
  index: SegmentIndex,
  point: Position,
  meters: number,
): Set<number> {
  if (!isPosition(point) || !Number.isFinite(meters) || meters < 0)
    return new Set();
  const [lng, lat] = point;
  const latRadius = meters / METERS_PER_DEG_LAT;
  const lngRadius = latRadius / Math.max(Math.cos((lat * Math.PI) / 180), 0.01);
  const keys = gridCells(
    index.cellSizeDegrees,
    [lng - lngRadius, lat - latRadius],
    [lng + lngRadius, lat + latRadius],
  );
  if (!keys)
    return new Set(Array.from({ length: index.segmentCount }, (_, i) => i));
  const found = new Set(index.unindexedSegments);
  for (const key of keys) {
    for (const segment of index.grid.get(key) ?? []) found.add(segment);
  }
  return found;
}

function gridCells(
  cellSizeDegrees: number,
  [west, south]: Position,
  [east, north]: Position,
): string[] | null {
  const minX = Math.floor(west / cellSizeDegrees);
  const maxX = Math.floor(east / cellSizeDegrees);
  const minY = Math.floor(south / cellSizeDegrees);
  const maxY = Math.floor(north / cellSizeDegrees);
  const count = (maxX - minX + 1) * (maxY - minY + 1);
  if (!Number.isFinite(count) || count > MAX_GRID_CELLS) return null;
  const keys: string[] = [];
  // At most MAX_GRID_CELLS iterations, checked before expanding the box.
  for (let x = minX; x <= maxX; x++) {
    for (let y = minY; y <= maxY; y++) keys.push(`${x}:${y}`);
  }
  return keys;
}

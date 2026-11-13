import { isPosition, segmentProjection, type Position } from './geometry';
import { segmentsNear, type SegmentIndex } from './segment-index';

export interface SegmentSnap {
  distanceMeters: number;
  from: number;
  metersToFrom: number;
  metersToTo: number;
  point: Position;
  segment: number;
  to: number;
}

/** Shared snapping search; callers supply only eligibility and preference rules. */
export function snapToSegments(
  index: SegmentIndex,
  nodes: Map<number, Position>,
  segmentAt: (index: number) => { a: number; b: number },
  point: Position,
  maxMeters: number,
  {
    accept,
    prefer,
    preferenceMeters = 0,
  }: {
    accept?: (index: number) => boolean;
    prefer?: (index: number) => boolean;
    preferenceMeters?: number;
  } = {},
): SegmentSnap | null {
  if (!isPosition(point) || !Number.isFinite(maxMeters) || maxMeters < 0)
    return null;
  const project = segmentProjection(point);
  let best: SegmentSnap | null = null;
  let preferred: SegmentSnap | null = null;
  // Candidates are bounded by the indexed segments, even for huge search radii.
  for (const segment of segmentsNear(index, point, maxMeters)) {
    if (accept && !accept(segment)) continue;
    const { a, b } = segmentAt(segment);
    const from = nodes.get(a);
    const to = nodes.get(b);
    if (!from || !to) continue;
    const projected = project(from, to);
    if (projected.distanceMeters > maxMeters) continue;
    const snap = { ...projected, from: a, to: b, segment };
    if (!best || snap.distanceMeters < best.distanceMeters) best = snap;
    if (
      prefer?.(segment) &&
      (!preferred || snap.distanceMeters < preferred.distanceMeters)
    )
      preferred = snap;
  }
  return preferred &&
    best &&
    preferred.distanceMeters <= best.distanceMeters + preferenceMeters
    ? preferred
    : best;
}

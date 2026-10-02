/**
 * The geometry editor's bulk operations, as pure functions over a trail's parts.
 *
 * Terra Draw edits one point of one piece at a time. Everything here works on a
 * *selection* of points across any number of pieces — delete, move, split,
 * simplify — or on whole pieces — join, reverse. Each returns the new parts
 * plus the selection mapped onto them, so the editor can keep showing what the
 * curator had selected wherever that still means something.
 *
 * Inputs are never mutated: the editor keeps the previous parts as an undo
 * snapshot.
 *
 * Client-safe, like `geometry.ts` — this runs in the admin bundle.
 */
import { haversineDistance } from '@/utils/ride-stats';
import { cloneParts, MIN_POINTS_PER_PART } from './geometry';
import { simplifyLine } from './gpx';

type Position = [number, number];
type Parts = Position[][];

/** A point in the line: which piece, and which point within it. */
export interface PointRef {
  index: number;
  part: number;
}

export interface EditResult {
  parts: Parts;
  selection: PointRef[];
}

/** Endpoints closer than this are the same place, and joining merges them. */
export const SAME_POINT_M = 1;

export function pointKey({ index, part }: PointRef): string {
  return `${part}:${index}`;
}

export function parsePointKey(key: string): PointRef {
  const [part, index] = key.split(':').map(Number);
  return { index, part };
}

/**
 * Removes the selected points.
 *
 * A piece left with fewer than two points stops existing, the same rule
 * `parseTrailGeometry` applies — so selecting a whole piece and deleting it
 * removes the piece.
 */
export function deletePoints(parts: Parts, selection: PointRef[]): EditResult {
  const doomed = byPart(selection);
  const next = parts
    .map((part, partIndex) => {
      const drop = doomed.get(partIndex);
      return drop
        ? part.filter((_, index) => !drop.has(index))
        : part.map(copy);
    })
    .filter((part) => part.length >= MIN_POINTS_PER_PART);
  return { parts: next, selection: [] };
}

/** Moves the selected points by the same offset, in degrees. */
export function movePoints(
  parts: Parts,
  selection: PointRef[],
  [dLng, dLat]: Position,
): EditResult {
  const moving = byPart(selection);
  const next = parts.map((part, partIndex) => {
    const set = moving.get(partIndex);
    return part.map((point, index) =>
      set?.has(index)
        ? ([point[0] + dLng, point[1] + dLat] as Position)
        : copy(point),
    );
  });
  return { parts: next, selection };
}

/**
 * Splits pieces at the selected points.
 *
 * The split point is kept on both sides, so the two new pieces still meet and
 * a later join closes them up without a gap. A piece's first and last points
 * can't split anything and are ignored. The selection becomes the split points'
 * new positions — the end of one piece and the start of the next.
 */
export function splitAtPoints(parts: Parts, selection: PointRef[]): EditResult {
  const cuts = byPart(selection);
  const next: Parts = [];
  const nextSelection: PointRef[] = [];

  parts.forEach((part, partIndex) => {
    const at = [...(cuts.get(partIndex) ?? [])]
      .filter((index) => index > 0 && index < part.length - 1)
      .sort((a, b) => a - b);
    let start = 0;
    for (const index of at) {
      next.push(part.slice(start, index + 1).map(copy));
      // The end of this piece, and the start of the one about to follow it.
      nextSelection.push(
        { index: index - start, part: next.length - 1 },
        { index: 0, part: next.length },
      );
      start = index;
    }
    next.push(part.slice(start).map(copy));
  });

  return { parts: next, selection: nextSelection };
}

/** Reverses the given pieces' direction. Selected points stay selected. */
export function reverseParts(
  parts: Parts,
  targets: number[],
  selection: PointRef[] = [],
): EditResult {
  const flip = new Set(targets);
  return {
    parts: parts.map((part, partIndex) =>
      flip.has(partIndex) ? [...part].reverse().map(copy) : part.map(copy),
    ),
    selection: selection.map((ref) =>
      flip.has(ref.part)
        ? { index: parts[ref.part].length - 1 - ref.index, part: ref.part }
        : ref,
    ),
  };
}

/**
 * Joins the given pieces into one.
 *
 * Starting from the first, repeatedly attaches whichever remaining piece has
 * an end nearest either end of the line so far, reversing it if needed. Ends
 * within {@link SAME_POINT_M} merge into one point; anything further apart is
 * bridged with a straight segment, which is what joining across a gap means.
 * The joined piece takes the place of the first target. Bounded by the square
 * of the number of targets — a handful, in practice.
 */
export function joinParts(parts: Parts, targets: number[]): EditResult {
  const wanted = [...new Set(targets)]
    .filter((index) => index >= 0 && index < parts.length)
    .sort((a, b) => a - b);
  if (wanted.length < 2) {
    return { parts: cloneParts(parts), selection: [] };
  }

  let line = parts[wanted[0]].map(copy);
  const remaining = wanted.slice(1).map((index) => parts[index]);

  while (remaining.length > 0) {
    let best = {
      index: 0,
      isAtStart: false,
      isReversed: false,
      meters: Infinity,
    };
    remaining.forEach((piece, index) => {
      const head = line[0];
      const tail = line[line.length - 1];
      const first = piece[0];
      const last = piece[piece.length - 1];
      const options = [
        { isAtStart: false, isReversed: false, meters: distance(tail, first) },
        { isAtStart: false, isReversed: true, meters: distance(tail, last) },
        { isAtStart: true, isReversed: false, meters: distance(head, last) },
        { isAtStart: true, isReversed: true, meters: distance(head, first) },
      ];
      for (const option of options) {
        if (option.meters < best.meters) {
          best = { ...option, index };
        }
      }
    });

    const [piece] = remaining.splice(best.index, 1);
    const oriented = (best.isReversed ? [...piece].reverse() : piece).map(copy);
    const isTouching = best.meters <= SAME_POINT_M;
    line = best.isAtStart
      ? [...(isTouching ? oriented.slice(0, -1) : oriented), ...line]
      : [...line, ...(isTouching ? oriented.slice(1) : oriented)];
  }

  const drop = new Set(wanted.slice(1));
  const next: Parts = [];
  parts.forEach((part, index) => {
    if (index === wanted[0]) {
      next.push(line);
    } else if (!drop.has(index)) {
      next.push(part.map(copy));
    }
  });
  return { parts: next, selection: [] };
}

/**
 * Douglas–Peucker simplification of whole pieces, or of just the selected
 * stretches.
 *
 * With a selection, each unbroken run of selected points in a piece is
 * simplified on its own and everything outside it is left exactly as it was —
 * so a curator can thin out a noisy GPS section without disturbing OSM-precise
 * geometry either side. A run's end points are always kept, so the simplified
 * stretch still meets its neighbours.
 */
export function simplifyParts(
  parts: Parts,
  toleranceMeters: number,
  selection: PointRef[] = [],
): EditResult {
  if (selection.length === 0) {
    return {
      parts: parts.map((part) => simplifyLine(part, toleranceMeters)),
      selection: [],
    };
  }

  const chosen = byPart(selection);
  const next = parts.map((part, partIndex) => {
    const set = chosen.get(partIndex);
    if (!set) {
      return part.map(copy);
    }
    const out: Position[] = [];
    let index = 0;
    while (index < part.length) {
      if (!set.has(index)) {
        out.push(copy(part[index]));
        index++;
        continue;
      }
      let end = index;
      while (end + 1 < part.length && set.has(end + 1)) {
        end++;
      }
      out.push(...simplifyLine(part.slice(index, end + 1), toleranceMeters));
      index = end + 1;
    }
    return out;
  });
  return { parts: next, selection: [] };
}

/** The pieces that hold at least one selected point, in order. */
export function partsOf(selection: PointRef[]): number[] {
  return [...new Set(selection.map((ref) => ref.part))].sort((a, b) => a - b);
}

function byPart(selection: PointRef[]): Map<number, Set<number>> {
  const map = new Map<number, Set<number>>();
  for (const { index, part } of selection) {
    const set = map.get(part);
    if (set) {
      set.add(index);
    } else {
      map.set(part, new Set([index]));
    }
  }
  return map;
}

function copy(point: Position): Position {
  return [point[0], point[1]];
}

function distance(a: Position, b: Position): number {
  return haversineDistance(a[1], a[0], b[1], b[0]);
}

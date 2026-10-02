/**
 * Assembles the OSM ways a curated trail rides on into one ordered line.
 *
 * OSM splits a continuous trail into many ways wherever a tag changes (surface,
 * access, a bridge), and they come back from Overpass in id order, not walking
 * order — sometimes reversed. This joins them end to end.
 *
 * Unlike the client-side `stitchLines`, which drops segments it can't attach,
 * anything left over is kept as a separate part of the MultiLineString and the
 * gap is *reported*. A curator needs to see "these two pieces don't meet" —
 * silently dropping a piece is how a trail loses half its length without
 * anyone noticing. This is the same failure mode scripts/audit_bend_trails.py
 * exists to catch.
 */
import { haversineDistance } from '@/utils/ride-stats';
import type { OsmWay } from './overpass';

/**
 * Two endpoints within this distance are treated as the same point.
 *
 * 25 m matches the tolerance scripts/align_bend_geometry.py uses against this
 * same data. Ways that share a node meet exactly, but real trails are full of
 * near-misses where a mapper drew two ways that visibly connect without
 * snapping the nodes together. The client's `stitchLines` can afford a tighter
 * 12 m because it rejoins tile-clipped pieces of one way, not separate ways.
 */
export const JOIN_TOLERANCE_M = 25;

/**
 * A gap bigger than this is called out to the editor.
 *
 * Parts that don't touch are usually a mistake — a wrong way picked, a missing
 * connector, or a hand edit that pulled an endpoint away from its neighbour.
 * Below this, it's the near-miss noise that {@link JOIN_TOLERANCE_M} exists to
 * absorb and not worth a warning.
 */
export const NOTABLE_GAP_M = 50;

export interface AssemblyGap {
  /** Distance in meters between the two parts that failed to join. */
  distanceMeters: number;
  /** Index of the part before the gap, in the returned `parts` array. */
  fromPart: number;
  toPart: number;
}

export interface AssembledGeometry {
  /**
   * OSM ids that contributed geometry, in the order they were joined. A way
   * that was requested but missing upstream will not appear here.
   */
  orderedIds: number[];
  /** Gaps between parts, worst first. Empty when the trail is continuous. */
  gaps: AssemblyGap[];
  /**
   * Connected runs of coordinates. One entry means the trail is continuous;
   * more than one means it has gaps.
   */
  parts: [number, number][][];
}

function distanceBetween(a: [number, number], b: [number, number]): number {
  return haversineDistance(a[1], a[0], b[1], b[0]);
}

function joins(a: [number, number], b: [number, number]): boolean {
  return distanceBetween(a, b) <= JOIN_TOLERANCE_M;
}

interface Segment {
  coordinates: [number, number][];
  ids: number[];
}

/**
 * Greedily grows a run from the first unused segment, attaching any segment
 * whose either endpoint meets either end of the run (reversing as needed).
 */
function growRun(segments: Segment[]): Segment {
  const run = segments.shift() as Segment;

  let attached = true;
  while (attached && segments.length > 0) {
    attached = false;

    for (let i = 0; i < segments.length; i++) {
      const candidate = segments[i];
      const head = run.coordinates[0];
      const tail = run.coordinates[run.coordinates.length - 1];
      const start = candidate.coordinates[0];
      const end = candidate.coordinates[candidate.coordinates.length - 1];

      if (joins(tail, start)) {
        // Skip the shared node so it isn't duplicated in the output.
        run.coordinates.push(...candidate.coordinates.slice(1));
        run.ids.push(...candidate.ids);
      } else if (joins(tail, end)) {
        run.coordinates.push(...candidate.coordinates.slice(0, -1).reverse());
        run.ids.push(...candidate.ids);
      } else if (joins(head, end)) {
        run.coordinates.unshift(...candidate.coordinates.slice(0, -1));
        run.ids.unshift(...candidate.ids);
      } else if (joins(head, start)) {
        run.coordinates.unshift(...candidate.coordinates.slice(1).reverse());
        run.ids.unshift(...candidate.ids);
      } else {
        continue;
      }

      segments.splice(i, 1);
      attached = true;
      break;
    }
  }

  return run;
}

/**
 * Joins ways into as few continuous runs as possible.
 *
 * Ways are assembled in the order given, so passing them in the order an editor
 * picked them produces a predictable result for a trail that doubles back on
 * itself (a lollipop loop, say) where several orderings are geometrically valid.
 */
export function assembleWays(ways: OsmWay[]): AssembledGeometry {
  const segments: Segment[] = ways
    .filter((way) => way.coordinates.length >= 2)
    .map((way) => ({ coordinates: [...way.coordinates], ids: [way.id] }));

  if (segments.length === 0) {
    return { gaps: [], orderedIds: [], parts: [] };
  }

  const grown: Segment[] = [];
  while (segments.length > 0) {
    grown.push(growRun(segments));
  }

  // Runs come out in the order they were seeded, which is pick order, not
  // walking order. Leaving them that way makes the elevation chart jump from
  // the far end of one run to the far end of the next.
  const runs = walkingOrder(grown.map((run) => run.coordinates)).map(
    ({ index, reversed }) =>
      reversed
        ? {
            coordinates: [...grown[index].coordinates].reverse(),
            ids: [...grown[index].ids].reverse(),
          }
        : grown[index],
  );

  const parts = runs.map((run) => run.coordinates);

  return {
    gaps: gapsBetweenParts(parts),
    orderedIds: runs.flatMap((run) => run.ids),
    parts,
  };
}

/** One step of a walk through a trail's parts. */
export interface PartStep {
  /** Index into the parts that were ordered. */
  index: number;
  /** Walk this part from its last coordinate to its first. */
  reversed: boolean;
}

/**
 * Two walks whose gaps differ by less than this are equally good, and the one
 * that keeps more of the source direction wins.
 */
const GAP_TIE_M = 1;

/**
 * Orders and orients a trail's parts so each one starts where the last ended.
 *
 * Multi-part geometry arrives in whatever order its source kept it: GIS
 * exports group pieces by feature id, and hand edits append new pieces at the
 * end. The parts are walked in sequence to build the elevation profile, so out
 * of order they make the chart leap between distant ends of the trail. East
 * Rim's two GIS pieces were stored far end first, putting a 1.1 km break
 * mid-chart where the pieces really sit 180 m apart.
 *
 * Every part and orientation is tried as the start, then the nearest free end
 * is followed greedily; the walk with the least total gap wins. A walk and its
 * exact reverse always tie, so ties go to whichever keeps more length in its
 * source direction. Cost is O(n³) in the number of parts; the most fragmented
 * trail in either city has 22.
 */
export function walkingOrder(parts: [number, number][][]): PartStep[] {
  const usable = parts
    .map((part, index) => ({ index, lengthMeters: lengthMeters([part]), part }))
    .filter(({ part }) => part.length > 0);

  const walks: Walk[] = [];
  for (const first of usable) {
    for (const firstReversed of [false, true]) {
      walks.push(walkFrom(first, firstReversed, usable));
    }
  }
  if (walks.length === 0) {
    return [];
  }

  // Ties are judged against the shortest walk, not pairwise against whichever
  // walk currently leads; pairwise, each step could give up another metre.
  const shortestGapMeters = Math.min(...walks.map((walk) => walk.gapMeters));
  let best: Walk | null = null;
  for (const walk of walks) {
    if (
      walk.gapMeters <= shortestGapMeters + GAP_TIE_M &&
      (!best || walk.forwardMeters > best.forwardMeters)
    ) {
      best = walk;
    }
  }
  return best?.steps ?? [];
}

interface Walk {
  /** Length walked in each part's source direction, for breaking ties. */
  forwardMeters: number;
  gapMeters: number;
  steps: PartStep[];
}

interface WalkablePart {
  index: number;
  lengthMeters: number;
  part: [number, number][];
}

/** Follows the nearest free end greedily from one starting part. */
function walkFrom(
  first: WalkablePart,
  firstReversed: boolean,
  usable: WalkablePart[],
): Walk {
  const steps: PartStep[] = [{ index: first.index, reversed: firstReversed }];
  const remaining = usable.filter(({ index }) => index !== first.index);
  let tail = endOf(first.part, firstReversed);
  let gapMeters = 0;
  let forwardMeters = firstReversed ? 0 : first.lengthMeters;

  while (remaining.length > 0) {
    let nearest = {
      at: 0,
      distanceMeters: Number.POSITIVE_INFINITY,
      reversed: false,
    };
    remaining.forEach(({ part }, at) => {
      const toStartMeters = distanceBetween(tail, part[0]);
      const toEndMeters = distanceBetween(tail, part[part.length - 1]);
      if (toStartMeters < nearest.distanceMeters) {
        nearest = { at, distanceMeters: toStartMeters, reversed: false };
      }
      if (toEndMeters < nearest.distanceMeters) {
        nearest = { at, distanceMeters: toEndMeters, reversed: true };
      }
    });

    const [next] = remaining.splice(nearest.at, 1);
    steps.push({ index: next.index, reversed: nearest.reversed });
    gapMeters += nearest.distanceMeters;
    if (!nearest.reversed) {
      forwardMeters += next.lengthMeters;
    }
    tail = endOf(next.part, nearest.reversed);
  }

  return { forwardMeters, gapMeters, steps };
}

function endOf(part: [number, number][], reversed: boolean): [number, number] {
  return reversed ? part[0] : part[part.length - 1];
}

/**
 * Reports the shortest hop between each consecutive pair of parts, worst first.
 *
 * That distance is what a curator would have to close, and it tells them
 * whether they're missing a connecting way or picked something unrelated.
 *
 * Separate from {@link assembleWays} because hand-edited geometry needs the same
 * check: dragging an endpoint away from its neighbour opens a gap just as
 * surely as picking the wrong way does, and it should be reported the same way.
 */
export function gapsBetweenParts(parts: [number, number][][]): AssemblyGap[] {
  const gaps: AssemblyGap[] = [];

  for (let i = 1; i < parts.length; i++) {
    const previous = parts[i - 1];
    const current = parts[i];
    if (previous.length === 0 || current.length === 0) {
      continue;
    }
    // Either end of either part may be the one that was meant to join.
    const candidates = [
      distanceBetween(previous[previous.length - 1], current[0]),
      distanceBetween(
        previous[previous.length - 1],
        current[current.length - 1],
      ),
      distanceBetween(previous[0], current[0]),
      distanceBetween(previous[0], current[current.length - 1]),
    ];
    gaps.push({
      distanceMeters: Math.round(Math.min(...candidates)),
      fromPart: i - 1,
      toPart: i,
    });
  }

  return gaps.sort((a, b) => b.distanceMeters - a.distanceMeters);
}

/** Total length in meters across all parts. Gaps are not counted. */
export function lengthMeters(parts: [number, number][][]): number {
  let total = 0;
  for (const part of parts) {
    for (let i = 1; i < part.length; i++) {
      total += distanceBetween(part[i - 1], part[i]);
    }
  }
  return total;
}

/** Bounding box as [swLng, swLat, neLng, neLat] — the order the app uses. */
export function boundsOf(
  parts: [number, number][][],
): [number, number, number, number] | null {
  let minLng = Number.POSITIVE_INFINITY;
  let minLat = Number.POSITIVE_INFINITY;
  let maxLng = Number.NEGATIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;

  for (const part of parts) {
    for (const [lng, lat] of part) {
      minLng = Math.min(minLng, lng);
      minLat = Math.min(minLat, lat);
      maxLng = Math.max(maxLng, lng);
      maxLat = Math.max(maxLat, lat);
    }
  }

  if (!Number.isFinite(minLng)) {
    return null;
  }
  return [minLng, minLat, maxLng, maxLat];
}

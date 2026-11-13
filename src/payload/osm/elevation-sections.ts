import { lengthMeters, walkingOrder } from './assemble';
import { dropRepeatedPoints } from './geometry';

type Position = [number, number];

interface PartEnd {
  part: number;
  end: 0 | 1;
}

interface ElevationSection {
  coordinates: Position[];
  firstPart: number;
  lastPart: number;
}

// GIS slivers such as Crabtree's 4 cm stub have no meaningful measurement.
export const MIN_ELEVATION_PART_METERS = 0.1;
const MAX_LOOP_START_PARTS = 100;

/**
 * Walks each unambiguous chain or loop. A junction of degree three or higher
 * ends the chain because the geometry supplies no itinerary through it.
 * Only coincident endpoints establish connectivity. Near misses and crossings
 * can be separate paths and need source evidence before being joined.
 */
export function elevationSections(parts: Position[][]): ElevationSection[] {
  const lines = parts.map(dropRepeatedPoints);
  const lengths = lines.map((line) => lengthMeters([line]));
  const endsAt = new Map<string, PartEnd[]>();
  const ends: PartEnd[] = [];
  for (const [part, line] of lines.entries()) {
    if (lengths[part] < MIN_ELEVATION_PART_METERS) continue;
    for (const end of [0, 1] as const) {
      const edge = { part, end };
      const key = endpoint(line, end).join(',');
      const junction = endsAt.get(key) ?? [];
      junction.push(edge);
      endsAt.set(key, junction);
      ends.push(edge);
    }
  }

  function continuation({ part, end }: PartEnd): PartEnd | undefined {
    const junction = endsAt.get(endpoint(lines[part], end).join(','));
    if (junction?.length !== 2) return;
    return junction.find((candidate) => candidate.part !== part);
  }

  const seen = new Set<number>();
  const walks: PartEnd[][] = [];
  // Open chains start at their free end. The second pass catches closed loops.
  // Every part is visited once.
  for (const start of [...ends.filter((end) => !continuation(end)), ...ends]) {
    if (seen.has(start.part)) continue;
    const walk: PartEnd[] = [];
    let current: PartEnd | undefined = start;
    let forwardMeters = 0;
    while (current && !seen.has(current.part)) {
      walk.push(current);
      seen.add(current.part);
      forwardMeters += lengths[current.part] * (current.end === 0 ? 1 : -1);
      current = continuation(oppositeEnd(current));
    }

    // Preserve as much of the supplied direction as possible within the chain.
    walks.push(forwardMeters < 0 ? walk.reverse().map(oppositeEnd) : walk);
  }

  const sectionEnds = walks.map((walk) => [
    positionAt(lines, walk[0]),
    positionAt(lines, oppositeEnd(walk[walk.length - 1])),
  ]);

  const sections = walks.map((walk, index) => {
    const [first, last] = sectionEnds[index];
    // A multipart loop has no inherent start. Pick its junction nearest the
    // other sections so its arbitrary start doesn't inflate a real gap.
    // This search is quadratic in part count and skipped for large imports.
    if (
      parts.length <= MAX_LOOP_START_PARTS &&
      walk.length > 1 &&
      first[0] === last[0] &&
      first[1] === last[1]
    ) {
      const start = loopStart(walk, lines, sectionEnds, index);
      walk = [...walk.slice(start), ...walk.slice(0, start)];
    }
    return sectionFromWalk(walk, lines);
  });

  // Retain walking order for display while sampling every section separately.
  return walkingOrder(sections.map(({ coordinates }) => coordinates)).map(
    ({ index, reversed }) => {
      const section = sections[index];
      return reversed
        ? {
            coordinates: section.coordinates.reverse(),
            firstPart: section.lastPart,
            lastPart: section.firstPart,
          }
        : section;
    },
  );
}

function loopStart(
  walk: PartEnd[],
  lines: Position[][],
  sectionEnds: Position[][],
  sectionIndex: number,
): number {
  let start = 0;
  let nearestMeters = Number.POSITIVE_INFINITY;
  for (const [index, end] of walk.entries()) {
    const point = positionAt(lines, end);
    for (const [otherIndex, positions] of sectionEnds.entries()) {
      if (otherIndex === sectionIndex) continue;
      for (const position of positions) {
        const meters = lengthMeters([[point, position]]);
        if (meters < nearestMeters) {
          start = index;
          nearestMeters = meters;
        }
      }
    }
  }
  return start;
}

function sectionFromWalk(
  walk: PartEnd[],
  lines: Position[][],
): ElevationSection {
  const coordinates: Position[] = [];
  for (const { part, end } of walk) {
    const line = end === 0 ? lines[part] : [...lines[part]].reverse();
    // Both pieces include the junction. Keep one sample at that coordinate.
    for (let index = coordinates.length ? 1 : 0; index < line.length; index++) {
      coordinates.push(line[index]);
    }
  }
  return {
    coordinates,
    firstPart: walk[0].part,
    lastPart: walk[walk.length - 1].part,
  };
}

function oppositeEnd({ part, end }: PartEnd): PartEnd {
  return { part, end: end === 0 ? 1 : 0 };
}

function positionAt(lines: Position[][], { part, end }: PartEnd): Position {
  return endpoint(lines[part], end);
}

function endpoint(line: Position[], end: 0 | 1): Position {
  return line[end === 0 ? 0 : line.length - 1];
}

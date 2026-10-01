/**
 * Turns a GPX file into trail line parts for the geometry editor.
 *
 * GPX is how a trail that isn't in OSM usually arrives: someone rode it with a
 * GPS, or traced it in another tool. Importing it is the same act as drawing it
 * by hand, so it lands as an 'edited' line — the server measures it on save like
 * any other hand-edited line.
 *
 * Client-safe on purpose: it runs in the admin bundle, against the browser's
 * `DOMParser`, and has no Node-only imports.
 */
import { MIN_POINTS_PER_PART } from './geometry';

/**
 * How far, in meters, a simplified line may stray from the recording.
 *
 * A one-second recording puts a point every few meters, which makes a line far
 * too dense to adjust by hand — Move points would show a solid bar of handles.
 * Consumer GPS is only good to a few meters anyway, so points closer than this
 * to the line through their neighbours carry noise, not shape.
 */
export const GPX_SIMPLIFY_TOLERANCE_M = 3;

export type GpxImport =
  | {
      error: null;
      name: string | null;
      ok: true;
      parts: [number, number][][];
      pointsRead: number;
    }
  | { error: string; ok: false };

/**
 * Reads the tracks out of a GPX document, one part per track segment.
 *
 * Track segments are kept as separate parts rather than joined, because a
 * segment break is the recorder saying "the line was interrupted here" — joining
 * across it would draw a straight line through whatever the rider did while the
 * GPS was paused. Routes (`<rte>`) are the fallback for files planned in a tool
 * rather than recorded; waypoints are not lines and are ignored.
 */
export function parseGpx(
  text: string,
  toleranceMeters = GPX_SIMPLIFY_TOLERANCE_M,
): GpxImport {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (
    doc.getElementsByTagName('parsererror').length > 0 ||
    doc.documentElement?.localName !== 'gpx'
  ) {
    return { error: 'That file is not a GPX document.', ok: false };
  }

  const segments = byLocalName(doc, 'trkseg');
  const runs =
    segments.length > 0
      ? segments.map((segment) => byLocalName(segment, 'trkpt'))
      : byLocalName(doc, 'rte').map((route) => byLocalName(route, 'rtept'));

  let pointsRead = 0;
  const parts: [number, number][][] = [];
  for (const run of runs) {
    const points = dropRepeats(run.flatMap(positionOf));
    pointsRead += points.length;
    if (points.length >= MIN_POINTS_PER_PART) {
      parts.push(simplifyLine(points, toleranceMeters));
    }
  }

  if (parts.length === 0) {
    return {
      error:
        'That GPX file has no track or route with at least two points. Waypoints alone cannot make a trail line.',
      ok: false,
    };
  }

  return { error: null, name: nameOf(doc), ok: true, parts, pointsRead };
}

/**
 * Douglas–Peucker simplification, with distances in meters.
 *
 * Coordinates are projected onto a flat plane around the line's first point —
 * accurate to well under a meter across a trail's extent, which is all a
 * three-meter tolerance needs. Iterative rather than recursive, so a long
 * recording can't overflow the stack. Endpoints are always kept, so pieces that
 * met before simplifying still meet after.
 */
export function simplifyLine(
  points: [number, number][],
  toleranceMeters: number,
): [number, number][] {
  if (points.length <= 2 || toleranceMeters <= 0) {
    return points.map((point) => [...point] as [number, number]);
  }

  const [originLng, originLat] = points[0];
  const metersPerDegLat = 111_320;
  const metersPerDegLng =
    metersPerDegLat * Math.cos((originLat * Math.PI) / 180);
  const xy = points.map(([lng, lat]) => [
    (lng - originLng) * metersPerDegLng,
    (lat - originLat) * metersPerDegLat,
  ]);

  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;

  // Each entry is a span whose endpoints are kept; the stack never holds more
  // spans than the line has points.
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [first, last] = stack.pop()!;
    let farthest = -1;
    let farthestDistance = toleranceMeters;
    for (let index = first + 1; index < last; index++) {
      const distance = distanceToSegment(xy[index], xy[first], xy[last]);
      if (distance > farthestDistance) {
        farthest = index;
        farthestDistance = distance;
      }
    }
    if (farthest !== -1) {
      keep[farthest] = 1;
      stack.push([first, farthest], [farthest, last]);
    }
  }

  return points
    .filter((_, index) => keep[index] === 1)
    .map((point) => [...point] as [number, number]);
}

function distanceToSegment(
  [px, py]: number[],
  [ax, ay]: number[],
  [bx, by]: number[],
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const t =
    lengthSquared === 0
      ? 0
      : Math.max(
          0,
          Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared),
        );
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * Matches on local name so a GPX 1.0 file, a 1.1 file, and one that prefixes
 * its elements (`gpx:trkpt`) all read the same.
 */
function byLocalName(root: Document | Element, localName: string): Element[] {
  return Array.from(root.getElementsByTagNameNS('*', localName));
}

/** One point's position, or nothing when its attributes aren't a valid pair. */
function positionOf(point: Element): [number, number][] {
  const lat = Number(point.getAttribute('lat'));
  const lng = Number(point.getAttribute('lon'));
  const valid =
    point.hasAttribute('lat') &&
    point.hasAttribute('lon') &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180;
  return valid ? [[lng, lat]] : [];
}

/** A stopped recorder logs the same fix over and over; one copy is enough. */
function dropRepeats(points: [number, number][]): [number, number][] {
  return points.filter(
    (point, index) =>
      index === 0 ||
      point[0] !== points[index - 1][0] ||
      point[1] !== points[index - 1][1],
  );
}

/**
 * The track's own name, falling back to the file's, then a route's. GPX 1.0
 * has no `<metadata>` and names the file directly under `<gpx>`.
 */
function nameOf(doc: Document): string | null {
  for (const container of ['trk', 'metadata', 'rte', 'gpx']) {
    const element = byLocalName(doc, container)[0];
    const name = element
      ? Array.from(element.children).find((child) => child.localName === 'name')
      : undefined;
    const text = name?.textContent?.trim();
    if (text) {
      return text;
    }
  }
  return null;
}

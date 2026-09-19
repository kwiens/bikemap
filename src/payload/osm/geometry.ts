/**
 * Reads and validates the GeoJSON a trail stores in `geom`.
 *
 * `geom` used to be write-once server output, so nothing had to check it. Now
 * the geometry editor writes to it too, which makes it an input — and an input
 * arriving as untyped `jsonb` from a browser needs validating before it becomes
 * the line a rider follows. A dropped `-` on a longitude puts a Bend trail in
 * Kansas, and nothing downstream would notice.
 *
 * The same parse backs the field's `validate` (so the editor gets a message)
 * and the `beforeChange` hook (so a direct REST write can't skip it).
 *
 * Client-safe on purpose: no Node-only imports, so the admin bundle can use it.
 */

/** The stored shape. `LineString` is accepted on read and normalised away. */
export interface TrailGeometry {
  coordinates: [number, number][][];
  type: 'MultiLineString';
}

/**
 * `ok` exists purely so this narrows. TypeScript only discriminates a union on
 * a literal-typed member, and `error: string | null` isn't one — `if
 * (parse.error)` would leave `parts` possibly null at every use site.
 */
export type GeometryParse =
  | { error: null; ok: true; parts: [number, number][][] }
  | { error: string; ok: false; parts: null };

/** Two points is the minimum that draws a line. */
export const MIN_POINTS_PER_PART = 2;

function isPosition(value: unknown): value is [number, number] {
  if (!Array.isArray(value) || value.length < 2) {
    return false;
  }
  const [lng, lat] = value.map(Number);
  return (
    Number.isFinite(lng) &&
    Number.isFinite(lat) &&
    lng >= -180 &&
    lng <= 180 &&
    lat >= -90 &&
    lat <= 90
  );
}

/**
 * Parses a stored or submitted geometry value into plain coordinate runs.
 *
 * A null/absent value is valid and yields no parts — a trail that has not been
 * built yet is a legitimate row, not an error.
 */
export function parseTrailGeometry(value: unknown): GeometryParse {
  if (value === null || value === undefined || value === '') {
    return { error: null, ok: true, parts: [] };
  }

  const raw = typeof value === 'string' ? safeParse(value) : value;
  if (raw === null || typeof raw !== 'object') {
    return {
      error: 'Geometry must be a GeoJSON object.',
      ok: false,
      parts: null,
    };
  }

  const geometry = raw as { coordinates?: unknown; type?: unknown };

  // A single LineString is normalised to a one-part MultiLineString rather than
  // rejected: it is valid GeoJSON for the same shape, and refusing a paste that
  // came out of another tool would be needless friction.
  const runs =
    geometry.type === 'LineString'
      ? [geometry.coordinates]
      : geometry.type === 'MultiLineString'
        ? geometry.coordinates
        : null;

  if (runs === null) {
    return {
      error: `Geometry must be a MultiLineString or LineString, not "${String(geometry.type)}".`,
      ok: false,
      parts: null,
    };
  }
  if (!Array.isArray(runs)) {
    return {
      error: 'Geometry coordinates must be a list.',
      ok: false,
      parts: null,
    };
  }

  const parts: [number, number][][] = [];
  for (const [index, run] of runs.entries()) {
    if (!Array.isArray(run)) {
      return {
        error: `Part ${index + 1} of the geometry is not a list of positions.`,
        ok: false,
        parts: null,
      };
    }
    for (const position of run) {
      if (!isPosition(position)) {
        return {
          error: `Part ${index + 1} has a position that is not a valid [longitude, latitude] pair.`,
          ok: false,
          parts: null,
        };
      }
    }
    // Runs too short to draw are dropped rather than rejected — deleting a
    // vertex down to one point is a normal thing to do mid-edit, and the part
    // simply stops existing.
    if (run.length >= MIN_POINTS_PER_PART) {
      parts.push(run.map(([lng, lat]) => [Number(lng), Number(lat)]));
    }
  }

  return { error: null, ok: true, parts };
}

/** The `geom` value to store, or null when there is nothing to draw. */
export function toTrailGeometry(
  parts: [number, number][][],
): TrailGeometry | null {
  const usable = parts.filter((part) => part.length >= MIN_POINTS_PER_PART);
  return usable.length > 0
    ? { coordinates: usable, type: 'MultiLineString' }
    : null;
}

/** True when two geometries have identical coordinates. */
export function samePartsAs(
  a: [number, number][][],
  b: [number, number][][],
): boolean {
  return (
    a.length === b.length &&
    a.every(
      (part, i) =>
        part.length === b[i].length &&
        part.every(
          (point, j) => point[0] === b[i][j][0] && point[1] === b[i][j][1],
        ),
    )
  );
}

/**
 * A GeoJSON LineString feature, the unit the geometry editor works in.
 *
 * Terra Draw — like most editing libraries — edits `LineString`, not
 * `MultiLineString`, so a trail's parts become one feature each and are joined
 * back up on the way out. The mapping is 1:1 and order-preserving, which
 * matters: part order is what the assembler and the gap report are expressed in.
 */
export interface LinePartFeature {
  geometry: { coordinates: [number, number][]; type: 'LineString' };
  properties: Record<string, unknown>;
  type: 'Feature';
}

/**
 * Splits stored geometry into one editable feature per part.
 *
 * `mode` names the editing mode the features belong to, and it is **required**:
 * an editor's store rejects a feature whose `properties.mode` it doesn't
 * recognise. Terra Draw does that silently — `addFeatures` returns
 * `{ valid: false, reason: 'Mode property does not exist' }` rather than
 * throwing — so a trail's line simply never appears, in any mode, with nothing
 * on screen or in the console to say why. Taking it as a parameter keeps the
 * library's mode names out of this module while making the requirement
 * impossible to forget.
 */
export function partsToFeatures(
  parts: [number, number][][],
  mode: string,
): LinePartFeature[] {
  return parts
    .filter((part) => part.length >= MIN_POINTS_PER_PART)
    .map((part) => ({
      geometry: { coordinates: cloneParts([part])[0], type: 'LineString' },
      properties: { mode },
      type: 'Feature',
    }));
}

/**
 * Joins edited features back into parts.
 *
 * Anything that isn't a drawable LineString is dropped rather than rejected: a
 * half-drawn line is a normal intermediate state, and the editor shouldn't
 * refuse to read its own store mid-stroke.
 */
export function featuresToParts(features: unknown[]): [number, number][][] {
  const parts: [number, number][][] = [];

  for (const feature of features) {
    const geometry = (feature as LinePartFeature | undefined)?.geometry;
    if (
      geometry?.type !== 'LineString' ||
      !Array.isArray(geometry.coordinates)
    ) {
      continue;
    }
    const points = geometry.coordinates.filter(isPosition);
    if (points.length >= MIN_POINTS_PER_PART) {
      parts.push(points.map(([lng, lat]) => [Number(lng), Number(lat)]));
    }
  }

  return parts;
}

/**
 * Deep-copies coordinate runs.
 *
 * Terra Draw mutates the features it is handed, so anything crossing into it
 * has to be a copy — sharing arrays with the working line lets an edit leak
 * backwards into the state we compare against to decide whether anything
 * changed.
 */
export function cloneParts(parts: [number, number][][]): [number, number][][] {
  return parts.map((part) =>
    part.map((point) => [...point] as [number, number]),
  );
}

function safeParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

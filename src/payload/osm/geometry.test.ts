import { describe, it, expect } from 'vitest';
import {
  featuresToParts,
  parseTrailGeometry,
  partsToFeatures,
  samePartsAs,
  toTrailGeometry,
} from './geometry';

// `geom` is untyped `jsonb` that the geometry editor now writes to, so these
// pin the boundary between "an editor moved a point" and "something wrote
// nonsense into a trail's line".

const A: [number, number] = [-121.4, 44.0];
const B: [number, number] = [-121.39, 44.01];

describe('parseTrailGeometry', () => {
  it('reads a MultiLineString', () => {
    const parsed = parseTrailGeometry({
      coordinates: [[A, B]],
      type: 'MultiLineString',
    });
    expect(parsed.ok).toBe(true);
    expect(parsed.parts).toEqual([[A, B]]);
  });

  it('reads the same value back out of a JSON string', () => {
    // jsonb round-trips as a string through some of Payload's paths.
    const parsed = parseTrailGeometry(
      JSON.stringify({ coordinates: [[A, B]], type: 'MultiLineString' }),
    );
    expect(parsed.parts).toEqual([[A, B]]);
  });

  it('normalises a LineString to a one-part MultiLineString', () => {
    // Valid GeoJSON for the same shape, and what other tools paste in.
    const parsed = parseTrailGeometry({
      coordinates: [A, B],
      type: 'LineString',
    });
    expect(parsed.parts).toEqual([[A, B]]);
  });

  it('treats an absent line as valid and empty', () => {
    // A trail that hasn't been built yet is a legitimate row, not an error.
    for (const value of [null, undefined, '']) {
      const parsed = parseTrailGeometry(value);
      expect(parsed.ok).toBe(true);
      expect(parsed.parts).toEqual([]);
    }
  });

  it('drops a run too short to draw rather than rejecting the save', () => {
    // Deleting vertices down to one is a normal mid-edit state; the piece just
    // stops existing.
    const parsed = parseTrailGeometry({
      coordinates: [[A, B], [A]],
      type: 'MultiLineString',
    });
    expect(parsed.parts).toEqual([[A, B]]);
  });

  it('rejects an out-of-range coordinate', () => {
    // The failure this exists for: a dropped minus sign puts a Bend trail in
    // Kansas, and nothing downstream would notice.
    const parsed = parseTrailGeometry({
      coordinates: [[A, [-121.39, 244.01]]],
      type: 'MultiLineString',
    });
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toMatch(/longitude, latitude/);
  });

  it('rejects a non-line geometry', () => {
    const parsed = parseTrailGeometry({ coordinates: A, type: 'Point' });
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toMatch(/MultiLineString/);
  });

  it('rejects unparseable JSON', () => {
    expect(parseTrailGeometry('not json').ok).toBe(false);
  });
});

describe('toTrailGeometry', () => {
  it('returns null when nothing is left to draw', () => {
    // Deleting the last point must clear the field, not store an empty line.
    expect(toTrailGeometry([])).toBeNull();
    expect(toTrailGeometry([[A]])).toBeNull();
  });

  it('keeps only the drawable parts', () => {
    expect(toTrailGeometry([[A, B], [A]])).toEqual({
      coordinates: [[A, B]],
      type: 'MultiLineString',
    });
  });
});

describe('samePartsAs', () => {
  it('is what stops the editor from fighting the form over the same value', () => {
    expect(samePartsAs([[A, B]], [[A, B]])).toBe(true);
    expect(samePartsAs([[A, B]], [[A, [-121.39, 44.02]]])).toBe(false);
    expect(
      samePartsAs(
        [[A, B]],
        [
          [A, B],
          [A, B],
        ],
      ),
    ).toBe(false);
    expect(samePartsAs([[A, B]], [[A]])).toBe(false);
  });
});

const C: [number, number] = [-121.38, 44.02];
/** Terra Draw's LineString mode name. */
const MODE = 'linestring';

// Terra Draw edits LineStrings, the app stores a MultiLineString. This is the
// seam between them, and getting it wrong silently loses pieces of a trail.
describe('parts <-> Terra Draw features', () => {
  it('stamps the editing mode onto every feature', () => {
    // Terra Draw rejects a feature whose `properties.mode` it doesn't know, and
    // it does so *silently* — `addFeatures` returns { valid: false } rather than
    // throwing. Without this the trail's line never enters the store at all:
    // nothing renders, nothing is grabbable, and nothing says why.
    for (const feature of partsToFeatures([[A, B]], MODE)) {
      expect(feature.properties.mode).toBe(MODE);
    }
  });

  it('round-trips a multi-part line', () => {
    const parts: [number, number][][] = [
      [A, B],
      [B, C],
    ];
    expect(featuresToParts(partsToFeatures(parts, MODE))).toEqual(parts);
  });

  it('gives each part its own feature, in order', () => {
    // Part order is what the assembler and the gap report are expressed in, so
    // it has to survive the trip.
    const features = partsToFeatures(
      [
        [A, B],
        [B, C],
      ],
      MODE,
    );
    expect(features).toHaveLength(2);
    expect(features[0].geometry).toEqual({
      coordinates: [A, B],
      type: 'LineString',
    });
    expect(features[1].geometry.coordinates[1]).toEqual(C);
  });

  it('copies coordinates rather than aliasing them', () => {
    // Terra Draw mutates what it is handed; sharing arrays with the working
    // copy would let an edit leak backwards into state we compare against.
    const parts: [number, number][][] = [[A, B]];
    const features = partsToFeatures(parts, MODE);
    features[0].geometry.coordinates[0][0] = 0;
    expect(parts[0][0]).toEqual(A);
  });

  it('drops a half-drawn line instead of failing', () => {
    // A single click in Draw mode is a one-point feature. That is a normal
    // intermediate state, not an error — the editor must be able to read its
    // own store mid-stroke.
    expect(
      featuresToParts([
        { geometry: { coordinates: [A], type: 'LineString' }, type: 'Feature' },
        {
          geometry: { coordinates: [A, B], type: 'LineString' },
          type: 'Feature',
        },
      ]),
    ).toEqual([[A, B]]);
  });

  it('ignores features that are not lines', () => {
    // Terra Draw's store also holds the selection's coordinate and midpoint
    // Points. Counting those as geometry would corrupt the trail.
    expect(
      featuresToParts([
        { geometry: { coordinates: A, type: 'Point' }, type: 'Feature' },
        null,
        undefined,
        {},
      ]),
    ).toEqual([]);
  });
});

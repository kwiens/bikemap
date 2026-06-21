import { describe, it, expect } from 'vitest';
import {
  buildOsmTrailPopupHTML,
  osmTrailDetailRows,
  osmTrailType,
  osmTrailDifficulty,
  MTB_SCALE_RATING,
} from './osm-trails';

describe('osmTrailType', () => {
  it('maps highway tag to a friendly label', () => {
    expect(osmTrailType({ highway: 'cycleway' })).toBe('Cycleway');
    expect(osmTrailType({ highway: 'unknown_kind' })).toBe('Unknown Kind');
    expect(osmTrailType({})).toBeNull();
  });
});

describe('osmTrailDifficulty', () => {
  it('buckets mtb:scale into a rating + label, without exposing the raw scale', () => {
    expect(osmTrailDifficulty({ 'mtb:scale': '0' })).toEqual({
      label: 'Easy',
      rating: 'easy',
    });
    expect(osmTrailDifficulty({ 'mtb:scale': '3' })).toEqual({
      label: 'Advanced',
      rating: 'advanced',
    });
    expect(osmTrailDifficulty({ 'mtb:scale': '5' })).toEqual({
      label: 'Expert',
      rating: 'expert',
    });
    expect(osmTrailDifficulty({})).toBeNull();
  });

  it('handles +/- scale refinements via the shared rating map', () => {
    // The same map feeds the line color expression, so these must agree.
    expect(MTB_SCALE_RATING['4+']).toBe('expert');
    expect(MTB_SCALE_RATING['2-']).toBe('advanced');
    expect(MTB_SCALE_RATING['0+']).toBe('easy');
    expect(osmTrailDifficulty({ 'mtb:scale': '4+' })?.rating).toBe('expert');
    // Unknown token still buckets by its leading digit.
    expect(osmTrailDifficulty({ 'mtb:scale': '5x' })?.rating).toBe('expert');
  });
});

describe('osmTrailDetailRows', () => {
  it('maps secondary OSM tags to human-readable rows', () => {
    const rows = osmTrailDetailRows({
      highway: 'path',
      'mtb:scale': '2',
      surface: 'natural_ground',
      bicycle: 'designated',
      operator: 'Parks Dept',
    });
    // Type and Difficulty are rendered separately (subhead), not as rows.
    expect(rows).not.toContainEqual(['Type', 'Path']);
    expect(rows).toContainEqual(['Surface', 'Natural Ground']);
    expect(rows).toContainEqual(['Bikes', 'Designated']);
    expect(rows).toContainEqual(['Operator', 'Parks Dept']);
  });

  it('omits rows for missing tags', () => {
    expect(osmTrailDetailRows({ highway: 'cycleway' })).toEqual([]);
  });
});

describe('buildOsmTrailPopupHTML', () => {
  it('uses the trail name and renders a difficulty badge', () => {
    const html = buildOsmTrailPopupHTML({
      name: 'Dirt Therapy',
      highway: 'path',
      'mtb:scale': '1',
    });
    expect(html).toContain('Dirt Therapy');
    expect(html).toContain('osm-trail-badge--intermediate');
    expect(html).toContain('>Intermediate<');
    // The raw mtb:scale reference must not surface in the UI.
    expect(html).not.toContain('mtb:scale');
  });

  it('falls back to "Unnamed trail" when there is no name', () => {
    const html = buildOsmTrailPopupHTML({ highway: 'path' });
    expect(html).toContain('Unnamed trail');
  });

  it('escapes HTML in user-generated OSM values', () => {
    const html = buildOsmTrailPopupHTML({
      name: '<img src=x onerror=alert(1)>',
      operator: 'A & B <script>',
    });
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;img');
    expect(html).toContain('A &amp; B');
  });

  it('links to the OSM feature when OSM_ID is present', () => {
    const html = buildOsmTrailPopupHTML({
      name: 'X',
      OSM_ID: '12345',
      OSM_TYPE: 'way',
    });
    expect(html).toContain('https://www.openstreetmap.org/way/12345');
  });

  it('omits the OSM link when there is no id', () => {
    const html = buildOsmTrailPopupHTML({ name: 'X' });
    expect(html).not.toContain('openstreetmap.org');
  });
});

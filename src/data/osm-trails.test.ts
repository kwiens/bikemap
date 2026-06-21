import { describe, it, expect } from 'vitest';
import { buildOsmTrailPopupHTML, osmTrailDetailRows } from './osm-trails';

describe('osmTrailDetailRows', () => {
  it('maps OSM tags to human-readable rows', () => {
    const rows = osmTrailDetailRows({
      highway: 'path',
      'mtb:scale': '2',
      surface: 'natural_ground',
      bicycle: 'designated',
      operator: 'Parks Dept',
    });
    expect(rows).toContainEqual(['Type', 'Path']);
    expect(rows).toContainEqual(['Difficulty', 'Advanced (mtb:scale 2)']);
    expect(rows).toContainEqual(['Surface', 'Natural Ground']);
    expect(rows).toContainEqual(['Bikes', 'Designated']);
    expect(rows).toContainEqual(['Operator', 'Parks Dept']);
  });

  it('omits rows for missing tags', () => {
    const rows = osmTrailDetailRows({ highway: 'cycleway' });
    expect(rows).toEqual([['Type', 'Cycleway']]);
  });
});

describe('buildOsmTrailPopupHTML', () => {
  it('uses the trail name and renders detail rows', () => {
    const html = buildOsmTrailPopupHTML({
      name: 'Dirt Therapy',
      highway: 'path',
      'mtb:scale': '1',
    });
    expect(html).toContain('<h3>Dirt Therapy</h3>');
    expect(html).toContain('Intermediate (mtb:scale 1)');
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

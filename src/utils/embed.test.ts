import { describe, it, expect } from 'vitest';
import {
  buildEmbedSearch,
  DEFAULT_EMBED_OPTIONS,
  isEmbedLayer,
  parseEmbedOptions,
} from './embed';

describe('parseEmbedOptions', () => {
  it('returns defaults for an empty query', () => {
    expect(parseEmbedOptions('')).toEqual(DEFAULT_EMBED_OPTIONS);
    expect(parseEmbedOptions(new URLSearchParams())).toEqual(
      DEFAULT_EMBED_OPTIONS,
    );
  });

  it('defaults the sidebar to closed and honours sidebar=open', () => {
    expect(parseEmbedOptions('').sidebarOpen).toBe(false);
    expect(parseEmbedOptions('sidebar=open').sidebarOpen).toBe(true);
    expect(parseEmbedOptions('sidebar=closed').sidebarOpen).toBe(false);
    expect(parseEmbedOptions('sidebar=banana').sidebarOpen).toBe(false);
  });

  it('accepts a leading ? and a route slug', () => {
    expect(parseEmbedOptions('?route=riverwalk-loop').route).toBe(
      'riverwalk-loop',
    );
    expect(parseEmbedOptions('route=').route).toBeUndefined();
    expect(parseEmbedOptions('route=%20').route).toBeUndefined();
  });

  it('parses center and zoom, rejecting malformed values', () => {
    expect(parseEmbedOptions('center=-85.31,35.05&zoom=13')).toMatchObject({
      center: [-85.31, 35.05],
      zoom: 13,
    });
    expect(parseEmbedOptions('center=abc').center).toBeUndefined();
    expect(parseEmbedOptions('center=1,2,3').center).toBeUndefined();
    expect(parseEmbedOptions('center=-200,35').center).toBeUndefined();
    expect(parseEmbedOptions('zoom=99').zoom).toBeUndefined();
    expect(parseEmbedOptions('zoom=-1').zoom).toBeUndefined();
    expect(parseEmbedOptions('zoom=x').zoom).toBeUndefined();
  });

  it('rejects empty or whitespace-only center components without treating them as 0', () => {
    expect(parseEmbedOptions('center=,').center).toBeUndefined();
    expect(parseEmbedOptions('center=1,').center).toBeUndefined();
    expect(parseEmbedOptions('center= , ').center).toBeUndefined();
    // A genuine 0,0 must still parse successfully.
    expect(parseEmbedOptions('center=0,0').center).toEqual([0, 0]);
  });

  it('rejects a `+`-decoded (whitespace) zoom without treating it as 0', () => {
    // URLSearchParams decodes `+` as a space.
    expect(parseEmbedOptions('zoom=+').zoom).toBeUndefined();
    expect(parseEmbedOptions('zoom=%20').zoom).toBeUndefined();
    // A genuine 0 must still parse successfully.
    expect(parseEmbedOptions('zoom=0').zoom).toBe(0);
  });

  it('parses a comma list of known layers, dropping unknowns and dupes', () => {
    expect(
      parseEmbedOptions('layers=attractions,bogus,bikeNetwork,attractions')
        .layers,
    ).toEqual(['attractions', 'bikeNetwork']);
    expect(parseEmbedOptions('layers=').layers).toEqual([]);
    expect(parseEmbedOptions('layers= bikeNetwork ').layers).toEqual([
      'bikeNetwork',
    ]);
  });

  it('keeps at most one marker layer, preferring the first that appears', () => {
    expect(
      parseEmbedOptions('layers=attractions,bikeResources').layers,
    ).toEqual(['attractions']);
    expect(
      parseEmbedOptions('layers=bikeResources,attractions').layers,
    ).toEqual(['bikeResources']);
    expect(parseEmbedOptions('layers=attractions,bikeNetwork').layers).toEqual([
      'attractions',
      'bikeNetwork',
    ]);
    expect(
      parseEmbedOptions('layers=bikeNetwork,attractions,bikeRentals').layers,
    ).toEqual(['bikeNetwork', 'attractions']);
  });
});

describe('buildEmbedSearch', () => {
  it('emits nothing for defaults', () => {
    expect(buildEmbedSearch({})).toBe('');
    expect(buildEmbedSearch(DEFAULT_EMBED_OPTIONS)).toBe('');
    expect(buildEmbedSearch({ sidebarOpen: false, layers: [] })).toBe('');
  });

  it('round-trips through parseEmbedOptions', () => {
    const options = {
      sidebarOpen: true,
      route: 'riverwalk-loop',
      center: [-85.309, 35.0456] as [number, number],
      zoom: 12.5,
      layers: ['attractions', 'bikeNetwork'] as const,
    };
    const search = buildEmbedSearch({
      ...options,
      layers: [...options.layers],
    });
    expect(parseEmbedOptions(search)).toEqual({
      ...options,
      layers: [...options.layers],
    });
  });

  it('rounds coordinates to 5 decimals', () => {
    expect(buildEmbedSearch({ center: [-85.3096543219, 35.0456789] })).toBe(
      'center=-85.30965%2C35.04568',
    );
  });
});

describe('isEmbedLayer', () => {
  it('guards the known layer names', () => {
    expect(isEmbedLayer('attractions')).toBe(true);
    expect(isEmbedLayer('osmTrails')).toBe(false);
  });
});

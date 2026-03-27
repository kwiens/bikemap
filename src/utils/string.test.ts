import { describe, it, expect } from 'vitest';
import { slugify } from './string';

describe('slugify', () => {
  it('lowercases and replaces spaces with dashes', () => {
    expect(slugify('Big Forest')).toBe('big-forest');
  });

  it('strips apostrophes', () => {
    expect(slugify("Stringer's Ridge")).toBe('stringers-ridge');
  });

  it('replaces slashes with dashes and collapses them', () => {
    expect(slugify('Access Road / Old RR Grade')).toBe(
      'access-road-old-rr-grade',
    );
  });

  it('replaces ampersands with dashes', () => {
    expect(slugify('Trail & Other')).toBe('trail-other');
  });

  it('collapses multiple spaces and dashes', () => {
    expect(slugify('foo   bar--baz')).toBe('foo-bar-baz');
  });

  it('returns empty string for empty input', () => {
    expect(slugify('')).toBe('');
  });

  it('is idempotent on already-slugified strings', () => {
    expect(slugify('already-slugified')).toBe('already-slugified');
  });

  it('strips leading and trailing dashes from special chars', () => {
    expect(slugify('/hello/')).toBe('hello');
    expect(slugify("'test'")).toBe('test');
  });

  it('strips double quotes', () => {
    expect(slugify('"quoted"')).toBe('quoted');
  });

  it('handles strings with only special characters', () => {
    expect(slugify("'&/")).toBe('');
  });
});

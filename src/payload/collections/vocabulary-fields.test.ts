import { describe, expect, it } from 'vitest';
import { slugValidator } from './vocabulary-fields';

// `value` is what the app matches on rather than anything a rider sees, so a
// stray capital or space in it means a trail that silently loses its colour and
// its swatch shape. This is the only thing standing between a curator and that.

describe('slugValidator.value', () => {
  it('accepts a slug', () => {
    for (const value of ['easy', 'double-black', 'e-bike-2']) {
      expect(slugValidator.value(value)).toBe(true);
    }
  });

  it('rejects what would break the match', () => {
    for (const value of [
      'Easy', // capitals
      'double black', // spaces
      'double_black', // underscores
      '-leading',
      'trailing-',
      'double--dash',
      '',
      42,
      null,
      undefined,
    ]) {
      expect(slugValidator.value(value)).toEqual(expect.any(String));
    }
  });
});

describe('slugValidator.color', () => {
  it('accepts a 6-digit hex, in either case', () => {
    expect(slugValidator.color('#2563eb')).toBe(true);
    expect(slugValidator.color('#16A34A')).toBe(true);
  });

  it('rejects anything the map could not paint with', () => {
    for (const value of ['#fff', 'red', '2563eb', '#2563eb88', '', null, 0]) {
      expect(slugValidator.color(value)).toEqual(expect.any(String));
    }
  });
});

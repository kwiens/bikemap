import { describe, expect, it } from 'vitest';
import { MAX_WAYS_PER_REQUEST, parseOsmIds, validateOsmIds } from './ids';

describe('parseOsmIds', () => {
  it('normalizes JSON and numeric strings', () => {
    expect(parseOsmIds('["12", 34]')).toEqual({ ids: [12, 34], ok: true });
  });

  it('allows an empty field', () => {
    expect(parseOsmIds(null)).toEqual({ ids: [], ok: true });
    expect(parseOsmIds('')).toEqual({ ids: [], ok: true });
  });

  it.each([
    ['malformed JSON', '[1,'],
    ['a non-list', '{"id": 1}'],
    ['a non-number value', [true]],
    ['a non-integer', [1, 2.5]],
    ['a non-positive id', [1, 0]],
    ['a duplicate after normalization', [1, '1']],
    [
      'too many ways',
      Array.from({ length: MAX_WAYS_PER_REQUEST + 1 }, (_, index) => index + 1),
    ],
  ])('rejects %s', (_label, value) => {
    expect(parseOsmIds(value).ok).toBe(false);
    expect(validateOsmIds(value)).not.toBe(true);
  });
});

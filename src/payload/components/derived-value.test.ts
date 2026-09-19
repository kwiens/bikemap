import { describe, expect, it } from 'vitest';
import { slugify } from '@/utils/string';
import { shouldFollow } from './derived-value';

// `displayName` and `slug` follow the trail name until a curator takes them
// over. Deciding *when to stop* is the whole of this: the obvious rule — "only
// fill a blank" — looks right and produces a trail named `P`, because the first
// keystroke makes the field non-blank and it never updates again.

/**
 * Types a name one character at a time, exactly as the form does, and returns
 * what the derived field ends up holding.
 */
function type(
  name: string,
  transform: (value: string) => string = (value) => value,
  { editedTo }: { editedTo?: string } = {},
): string {
  let current = '';
  let lastApplied: null | string = null;

  for (let i = 1; i <= name.length; i++) {
    const derived = transform(name.slice(0, i));
    if (
      shouldFollow({
        current,
        derived,
        focused: false,
        lastApplied,
        readOnly: false,
      })
    ) {
      current = derived;
      lastApplied = derived;
    }
    // The curator edits the field by hand partway through.
    if (editedTo !== undefined && i === Math.ceil(name.length / 2)) {
      current = editedTo;
    }
  }
  return current;
}

describe('shouldFollow', () => {
  it('follows every keystroke, not just the first', () => {
    // The bug this exists for: it used to stop after one letter, so a trail
    // called "Pointe Break" was saved as "P".
    expect(type('Pointe Break')).toBe('Pointe Break');
    expect(type('Pointe Break', slugify)).toBe('pointe-break');
  });

  it('stops following once the field is edited by hand', () => {
    expect(type('Pointe Break', undefined, { editedTo: 'The Wave' })).toBe(
      'The Wave',
    );
  });

  it('leaves an existing value alone', () => {
    // Nothing here wrote it, so it belongs to whoever did. Display names are
    // routinely different from the raw tileset name, and a slug names a static
    // elevation file — rewriting one on open would break a chart.
    expect(
      shouldFollow({
        current: 'tiddlywinks-upper',
        derived: 'tiddlywinks-(upper)',
        focused: false,
        lastApplied: null,
        readOnly: false,
      }),
    ).toBe(false);
  });

  it('re-arms when the field is cleared', () => {
    // Clearing it is how you ask for the default back.
    expect(
      shouldFollow({
        current: '',
        derived: 'pointe-break',
        focused: false,
        lastApplied: 'something-else',
        readOnly: false,
      }),
    ).toBe(true);
  });

  it('never types over someone', () => {
    // Otherwise clearing the field to write your own refills it between
    // keystrokes.
    expect(
      shouldFollow({
        current: '',
        derived: 'pointe-break',
        focused: true,
        lastApplied: null,
        readOnly: false,
      }),
    ).toBe(false);
  });

  it('does nothing without a source, or when read-only', () => {
    const base = {
      current: '',
      focused: false,
      lastApplied: null,
      readOnly: false,
    };
    expect(shouldFollow({ ...base, derived: '' })).toBe(false);
    expect(shouldFollow({ ...base, derived: 'x', readOnly: true })).toBe(false);
  });

  it('does not rewrite a value that already matches', () => {
    // Would otherwise be a setValue on every render, marking the form dirty.
    expect(
      shouldFollow({
        current: 'pointe-break',
        derived: 'pointe-break',
        focused: false,
        lastApplied: 'pointe-break',
        readOnly: false,
      }),
    ).toBe(false);
  });
});

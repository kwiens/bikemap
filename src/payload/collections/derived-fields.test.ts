import { describe, expect, it } from 'vitest';
import { slugify } from '@/utils/string';
import { derivedFrom } from './Trails';

// `displayName` and `slug` fill themselves in from the trail name. The admin
// does it live as you type; this is the same rule for every other way a trail
// gets written — REST, the seeds, a script — so `required` isn't a trap for
// anything that isn't the form.
//
// The slug matters more than it looks: it is the key the elevation profile is
// looked up by, so a trail saved without one has a chart that cannot be found.

const copy = derivedFrom('trailName');
const slugged = derivedFrom('trailName', slugify);

describe('derivedFrom', () => {
  it('fills a blank from the source field', () => {
    expect(
      copy({ data: { trailName: 'Pointe Break' }, value: undefined }),
    ).toBe('Pointe Break');
    expect(
      slugged({ data: { trailName: 'Pointe Break' }, value: undefined }),
    ).toBe('pointe-break');
  });

  it('treats empty and whitespace as blank', () => {
    for (const value of ['', '   ', null, undefined]) {
      expect(slugged({ data: { trailName: 'Gimmie Two' }, value })).toBe(
        'gimmie-two',
      );
    }
  });

  it('keeps a value that was set deliberately', () => {
    // Display names are routinely different from the raw tileset trail name.
    expect(
      copy({
        data: { trailName: 'TIDDLY WINKS UPR' },
        value: 'Tiddlywinks (Upper)',
      }),
    ).toBe('Tiddlywinks (Upper)');
  });

  it('still normalises a slug the curator typed', () => {
    // It is a key, so it has to be slug-shaped however it arrived.
    expect(
      slugged({ data: { trailName: 'Whatever' }, value: 'Pointe Break' }),
    ).toBe('pointe-break');
  });

  it('leaves the value alone when there is no source yet', () => {
    // A partially filled form must not have `required` satisfied with junk.
    expect(copy({ data: {}, value: undefined })).toBeUndefined();
    expect(
      slugged({ data: { trailName: '' }, value: undefined }),
    ).toBeUndefined();
  });
});

// The same call shape means two different things depending on `operation`: on a
// create there is nothing to protect, on an update the field may simply not be
// part of the request. Deriving in the second case rewrites a curated slug —
// which keys the elevation profile lookup and the share URL — on a save that
// never mentioned it.
describe('derivedFrom on an existing document', () => {
  it('derives on create, and leaves the stored value alone on a partial update', () => {
    const args = {
      data: { trailName: 'Tiddlywinks (Upper)' },
      value: undefined,
    };

    expect(slugged({ ...args, operation: 'create' })).toBe(
      'tiddlywinks-(upper)',
    );
    expect(
      slugged({
        ...args,
        operation: 'update',
        previousValue: 'tiddlywinks-upper',
      }),
    ).toBe('tiddlywinks-upper');
  });

  it('leaves it alone when the stored value is handed back unchanged', () => {
    // Payload fills an absent field in from the document before the hooks run,
    // so "not in the request" can arrive looking exactly like "resent as is".
    expect(
      slugged({
        data: { trailName: 'Tiddlywinks (Upper)' },
        operation: 'update',
        previousValue: 'tiddlywinks-upper',
        value: 'tiddlywinks-upper',
      }),
    ).toBe('tiddlywinks-upper');
    expect(
      copy({
        data: { trailName: 'TIDDLY WINKS UPR' },
        operation: 'update',
        previousValue: 'Tiddlywinks (Upper)',
        value: 'Tiddlywinks (Upper)',
      }),
    ).toBe('Tiddlywinks (Upper)');
  });

  it('reads the stored value from originalDoc when given the field instead', () => {
    expect(
      slugged({
        data: { trailName: 'Tiddlywinks (Upper)' },
        field: { name: 'slug' },
        operation: 'update',
        originalDoc: { slug: 'tiddlywinks-upper' },
        value: undefined,
      }),
    ).toBe('tiddlywinks-upper');
  });

  it('normalises a new value the curator did send', () => {
    expect(
      slugged({
        data: { trailName: 'Tiddlywinks (Upper)' },
        operation: 'update',
        previousValue: 'tiddlywinks-upper',
        value: 'Tiddlywinks Upper Reroute',
      }),
    ).toBe('tiddlywinks-upper-reroute');
  });

  it('re-derives a field that was blanked on purpose', () => {
    // Clearing the field is how you ask for the default back — the same rule
    // the admin's live version follows (see components/derived-value.ts).
    expect(
      slugged({
        data: { trailName: 'Pointe Break' },
        operation: 'update',
        previousValue: 'tiddlywinks-upper',
        value: '',
      }),
    ).toBe('pointe-break');
  });

  it('fills a blank on an update of a trail that never had one', () => {
    expect(
      slugged({
        data: { trailName: 'Pointe Break' },
        operation: 'update',
        previousValue: '',
        value: undefined,
      }),
    ).toBe('pointe-break');
  });
});

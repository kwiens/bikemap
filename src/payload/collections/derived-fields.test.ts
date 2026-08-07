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

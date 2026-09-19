import { describe, it, expect, vi } from 'vitest';

// regionFor is the city's hardcoded REGION_MAP — the thing the trail-areas
// collection exists to make editable. Stubbed so the fallback is unambiguous.
vi.mock('@/data/geo_data', () => ({
  regionFor: (recArea: string) =>
    recArea === 'Known Area' ? 'Built-in Region' : 'Other',
}));

const { regionOf } = await import('./trail-region');
type Trail = Parameters<typeof regionOf>[0];

function trail(overrides: Partial<Trail>): Trail {
  return {
    color: '#000000',
    displayName: 'A Trail',
    icon: {} as Trail['icon'],
    rating: '',
    recArea: 'Known Area',
    trailName: 'A Trail',
    ...overrides,
  } as Trail;
}

describe('regionOf', () => {
  it('prefers the region stored on the trail', () => {
    // This is the payoff: an editor changes the area's region in the admin and
    // the sidebar regroups, with no deploy.
    expect(regionOf(trail({ region: 'From The Database' }))).toBe(
      'From The Database',
    );
  });

  it('falls back to the built-in map when no region is stored', () => {
    // Trails from the checked-in data have no region at all.
    expect(regionOf(trail({}))).toBe('Built-in Region');
  });

  it('falls back when the stored region is empty', () => {
    // The field is optional, so an area saved without one yields ''. That must
    // behave like "unset", not group everything under a blank heading.
    expect(regionOf(trail({ region: '' }))).toBe('Built-in Region');
  });
});

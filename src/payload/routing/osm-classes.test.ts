import { describe, expect, it } from 'vitest';
import { classifyWay } from './osm-classes';

describe('classifyWay', () => {
  it.each<[Record<string, string>, string]>([
    [{ highway: 'residential' }, 'street'],
    [{ highway: 'cycleway' }, 'cycleway'],
    [{ highway: 'path', bicycle: 'designated' }, 'cycleway'],
    [{ highway: 'track' }, 'path'],
    [{ highway: 'secondary_link' }, 'secondary'],
    [{ highway: 'footway', bicycle: 'yes' }, 'footway'],
    [{ 'mtb:scale': '2' }, 'path'],
  ])('routes %o as %s', (tags, expected) => {
    expect(classifyWay(tags)?.class).toBe(expected);
  });

  it.each<Record<string, string>>([
    { highway: 'motorway' },
    { highway: 'trunk' },
    { highway: 'footway' },
    { highway: 'path', bicycle: 'no' },
    { highway: 'residential', bicycle: 'dismount' },
    { highway: 'service', access: 'private' },
    { building: 'yes' },
  ])('does not route %o', (tags) => {
    expect(classifyWay(tags)).toBeNull();
  });

  it('lets an explicit bicycle tag override a private access tag', () => {
    expect(
      classifyWay({
        access: 'private',
        bicycle: 'permissive',
        highway: 'track',
      }),
    ).toEqual({ class: 'path', hasBikeLane: false });
  });

  it('spots a bike lane on either side', () => {
    expect(
      classifyWay({ 'cycleway:right': 'lane', highway: 'tertiary' })
        ?.hasBikeLane,
    ).toBe(true);
    expect(
      classifyWay({ cycleway: 'shared_lane', highway: 'tertiary' })
        ?.hasBikeLane,
    ).toBe(false);
  });
});

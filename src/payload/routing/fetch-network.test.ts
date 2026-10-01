import { describe, expect, it } from 'vitest';
import { cellBounds, cellsCovering } from './cells';
import { networkWaysFrom, routeNetworkQuery } from './fetch-network';

describe('networkWaysFrom', () => {
  it('keeps rideable ways with matching nodes and geometry', () => {
    const ways = networkWaysFrom([
      {
        geometry: [
          { lat: 44, lon: -121.3 },
          { lat: 44.001, lon: -121.3 },
        ],
        id: 7,
        nodes: [1, 2],
        tags: { highway: 'residential', name: 'Elm St' },
        type: 'way',
      },
      {
        geometry: [
          { lat: 44, lon: -121.3 },
          { lat: 44.001, lon: -121.3 },
        ],
        id: 8,
        nodes: [3, 4],
        tags: { highway: 'motorway' },
        type: 'way',
      },
      {
        geometry: [{ lat: 44, lon: -121.3 }],
        id: 9,
        nodes: [5, 6],
        tags: { highway: 'residential' },
        type: 'way',
      },
    ]);

    expect(ways).toEqual([
      {
        class: 'street',
        coordinates: [
          [-121.3, 44],
          [-121.3, 44.001],
        ],
        hasBikeLane: false,
        id: 7,
        name: 'Elm St',
        nodes: [1, 2],
      },
    ]);
  });
});

describe('routeNetworkQuery', () => {
  it('asks Overpass for south,west,north,east', () => {
    expect(routeNetworkQuery([-121.32, 44.04, -121.3, 44.06])).toContain(
      '(44.04,-121.32,44.06,-121.3)',
    );
  });
});

describe('cells', () => {
  it('covers a box with whole cells and round-trips a key', () => {
    const keys = cellsCovering([-121.21, 44.05, -121.19, 44.05]);

    expect(keys).toEqual(['-3031,1101', '-3030,1101']);
    const bounds = cellBounds(keys[0]);
    expect(bounds?.[0]).toBeCloseTo(-121.24, 9);
    expect(bounds?.[3]).toBeCloseTo(44.08, 9);
  });

  it('rejects malformed and out-of-range keys', () => {
    expect(cellBounds('1,2,3')).toBeNull();
    expect(cellBounds('abc')).toBeNull();
    expect(cellBounds('4501,0')).toBeNull();
  });
});

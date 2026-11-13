import { afterEach, describe, expect, it, vi } from 'vitest';
import { OverpassError } from '@/payload/osm/overpass';
import { cellBounds, cellsCovering } from './cells';
import {
  buildRouteGraph,
  routeBetween,
  snapToGraph,
  type Position,
} from './graph';
import {
  fetchRouteNetwork,
  networkWaysFrom,
  routeNetworkQuery,
} from './fetch-network';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('networkWaysFrom', () => {
  it('routes from a road along a paved sidewalk, crossing, and gravel trail', () => {
    const points: Position[] = [
      [-121.3, 44],
      [-121.299, 44],
      [-121.299, 44.001],
      [-121.298, 44.001],
      [-121.298, 44.002],
    ];
    const tags: Record<string, string>[] = [
      { highway: 'residential' },
      { highway: 'footway', footway: 'sidewalk', surface: 'paved' },
      { highway: 'footway', footway: 'crossing' },
      { highway: 'path', surface: 'gravel' },
    ];
    const ways = networkWaysFrom(
      tags.map((tags, index) => ({
        geometry: points
          .slice(index, index + 2)
          .map(([lon, lat]) => ({ lat, lon })),
        id: index + 1,
        nodes: [index + 1, index + 2],
        tags,
        type: 'way',
      })),
    );
    const graph = buildRouteGraph({ trails: [], ways });
    const from = snapToGraph(graph, points[0]);
    const to = snapToGraph(graph, points[4]);
    expect(from && to && routeBetween(graph, from, to)?.coordinates).toEqual(
      points,
    );
  });

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

describe('fetchRouteNetwork', () => {
  it('rejects a query Overpass reports as timed out, so it is not cached as empty', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          elements: [],
          remark:
            'runtime error: Query timed out in "query" at line 1 after 60 seconds.',
        }),
      ),
    );

    await expect(
      fetchRouteNetwork([-121.32, 44.04, -121.3, 44.06]),
    ).rejects.toBeInstanceOf(OverpassError);
  });

  it('returns the classified ways of a clean response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          elements: [
            {
              geometry: [
                { lat: 44, lon: -121.3 },
                { lat: 44.001, lon: -121.3 },
              ],
              id: 7,
              nodes: [1, 2],
              tags: { highway: 'residential' },
              type: 'way',
            },
          ],
        }),
      ),
    );

    const ways = await fetchRouteNetwork([-121.32, 44.04, -121.3, 44.06]);

    expect(ways.map((way) => way.id)).toEqual([7]);
  });
});

describe('routeNetworkQuery', () => {
  it('requests footways regardless of whether bicycle or surface tags are set', () => {
    const query = routeNetworkQuery([-121.32, 44.04, -121.3, 44.06]);
    const highwayFilter = query.match(/\["highway"~"\^\(([^)]+)\)/)?.[1];
    expect(highwayFilter?.split('|')).toEqual(
      expect.arrayContaining(['footway', 'path', 'cycleway', 'residential']),
    );
    expect(query).not.toMatch(/\["(?:bicycle|surface)"/);
  });

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

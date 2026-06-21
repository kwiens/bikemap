import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  geocodeAddress,
  updateRouteOpacity,
  calculateRouteBounds,
  findLocationInArray,
  flyToBounds,
  updateMtnBikeOpacity,
  highlightMtnBikeArea,
  initMtnBikeColors,
  hideStrayStyleLayers,
  detectTrailAtPoint,
  toLngLatBounds,
  TRAIL_LAYERS,
  ensureOsmTrailsSource,
  setOsmTrailsVisible,
  OSM_BIKE_TRAIL_FILTER,
  OSM_POI_FILTER,
} from './map';
import {
  OSM_TRAILS_SOURCE_ID,
  OSM_TRAILS_LAYER_ID,
  OSM_TRAILS_CASING_LAYER_ID,
  OSM_TRAILS_HIT_LAYER_ID,
  OSM_POI_LAYER_ID,
} from '@/data/osm-trails';
import type { BikeRoute, MountainBikeTrail } from '@/data/geo_data';
import { MTN_BIKE_LAYER_ID } from '@/data/geo_data';
import { TRAIL_METADATA, RATING_COLORS } from '@/data/trail-metadata';
import type { IconDefinition } from '@fortawesome/free-solid-svg-icons';
import type mapboxgl from 'mapbox-gl';

describe('Mapbox Geo Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('geocodeAddress', () => {
    it('should successfully geocode an address', async () => {
      const mockResponse = {
        features: [
          {
            center: [-85.3097, 35.0456],
            place_name: '100 Main St, Chattanooga, TN 37402',
          },
        ],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await geocodeAddress(
        '100 Main St, Chattanooga, TN',
        'test-token',
      );

      expect(result).toEqual([-85.3097, 35.0456]);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining(
          'https://api.mapbox.com/geocoding/v5/mapbox.places/',
        ),
      );
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('access_token=test-token'),
      );
    });

    it('should return null when no results found', async () => {
      const mockResponse = {
        features: [],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await geocodeAddress(
        'NonexistentAddress12345',
        'test-token',
      );

      expect(result).toBeNull();
    });

    it('should return null when geocoding request fails', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
      });

      const result = await geocodeAddress(
        '100 Main St, Chattanooga, TN',
        'invalid-token',
      );

      expect(result).toBeNull();
    });

    it('should handle network errors gracefully', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const result = await geocodeAddress(
        '100 Main St, Chattanooga, TN',
        'test-token',
      );

      expect(result).toBeNull();
    });

    it('should properly encode special characters in address', async () => {
      const mockResponse = {
        features: [
          {
            center: [-85.3, 35.0],
          },
        ],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      await geocodeAddress('123 Main St #5, Chattanooga, TN', 'test-token');

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining(
          encodeURIComponent('123 Main St #5, Chattanooga, TN'),
        ),
      );
    });

    it('should limit results to 1', async () => {
      const mockResponse = {
        features: [{ center: [-85.3, 35.0] }],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      await geocodeAddress('Main St', 'test-token');

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('limit=1'),
      );
    });
  });

  describe('updateRouteOpacity', () => {
    it('should update opacity for selected and unselected routes', () => {
      const mockMap = {
        setPaintProperty: vi.fn(),
        getLayer: vi.fn().mockReturnValue(undefined),
      } as unknown as mapboxgl.Map;

      const routes: BikeRoute[] = [
        {
          id: 'route1',
          name: 'Route 1',
          color: '#FF0000',
          description: 'Test route 1',
          icon: {} as IconDefinition,
          defaultWidth: 8,
          opacity: 1.0,
          distance: 5.0,
        },
        {
          id: 'route2',
          name: 'Route 2',
          color: '#00FF00',
          description: 'Test route 2',
          icon: {} as IconDefinition,
          defaultWidth: 8,
          opacity: 1.0,
          distance: 5.0,
        },
        {
          id: 'route3',
          name: 'Route 3',
          color: '#0000FF',
          description: 'Test route 3',
          icon: {} as IconDefinition,
          defaultWidth: 8,
          opacity: 1.0,
          distance: 5.0,
        },
      ];

      updateRouteOpacity(mockMap, routes, 'route2', {
        selected: 0.8,
        unselected: 0.2,
      });

      expect(mockMap.setPaintProperty).toHaveBeenCalledWith(
        'route1',
        'line-opacity',
        0.2,
      );
      expect(mockMap.setPaintProperty).toHaveBeenCalledWith(
        'route2',
        'line-opacity',
        0.8,
      );
      expect(mockMap.setPaintProperty).toHaveBeenCalledWith(
        'route3',
        'line-opacity',
        0.2,
      );
      expect(mockMap.setPaintProperty).toHaveBeenCalledTimes(3);
    });

    it('should set all routes to unselected when selectedId is null', () => {
      const mockMap = {
        setPaintProperty: vi.fn(),
        getLayer: vi.fn().mockReturnValue(undefined),
      } as unknown as mapboxgl.Map;

      const routes: BikeRoute[] = [
        {
          id: 'route1',
          name: 'Route 1',
          color: '#FF0000',
          description: 'Test route 1',
          icon: {} as IconDefinition,
          defaultWidth: 8,
          opacity: 1.0,
          distance: 5.0,
        },
        {
          id: 'route2',
          name: 'Route 2',
          color: '#00FF00',
          description: 'Test route 2',
          icon: {} as IconDefinition,
          defaultWidth: 8,
          opacity: 1.0,
          distance: 5.0,
        },
      ];

      updateRouteOpacity(mockMap, routes, null, {
        selected: 0.8,
        unselected: 0.1,
      });

      expect(mockMap.setPaintProperty).toHaveBeenCalledWith(
        'route1',
        'line-opacity',
        0.1,
      );
      expect(mockMap.setPaintProperty).toHaveBeenCalledWith(
        'route2',
        'line-opacity',
        0.1,
      );
    });

    it('should handle errors when setting paint property', () => {
      const mockMap = {
        setPaintProperty: vi.fn().mockImplementation(() => {
          throw new Error('Layer not found');
        }),
      } as unknown as mapboxgl.Map;

      const routes: BikeRoute[] = [
        {
          id: 'nonexistent-route',
          name: 'Nonexistent Route',
          color: '#FF0000',
          description: 'Test route',
          icon: {} as IconDefinition,
          defaultWidth: 8,
          opacity: 1.0,
          distance: 5.0,
        },
      ];

      expect(() => {
        updateRouteOpacity(mockMap, routes, 'nonexistent-route', {
          selected: 0.8,
          unselected: 0.2,
        });
      }).not.toThrow();
    });
  });

  describe('calculateRouteBounds', () => {
    it('should calculate bounds for LineString features', () => {
      const mockMap = {
        querySourceFeatures: vi.fn().mockReturnValue([
          {
            geometry: {
              type: 'LineString',
              coordinates: [
                [-85.3, 35.0],
                [-85.31, 35.01],
                [-85.32, 35.02],
              ],
            },
          },
        ]),
      } as unknown as mapboxgl.Map;

      const mockRoute = {
        id: 'test-route',
        name: 'Test Route',
        color: '#FF0000',
        description: 'Test',
        icon: {} as IconDefinition,
        defaultWidth: 8,
        opacity: 1.0,
        distance: 5.0,
      };

      const mockLayer = {
        id: 'test-route',
        type: 'line',
        source: 'test-source',
        'source-layer': 'test-layer',
      } as mapboxgl.AnyLayer;

      const bounds = calculateRouteBounds(mockMap, mockRoute, mockLayer);

      expect(bounds).not.toBeNull();
      expect(mockMap.querySourceFeatures).toHaveBeenCalledWith('test-source', {
        sourceLayer: 'test-layer',
      });
    });

    it('should calculate bounds for MultiLineString features', () => {
      const mockMap = {
        querySourceFeatures: vi.fn().mockReturnValue([
          {
            geometry: {
              type: 'MultiLineString',
              coordinates: [
                [
                  [-85.3, 35.0],
                  [-85.31, 35.01],
                ],
                [
                  [-85.32, 35.02],
                  [-85.33, 35.03],
                ],
              ],
            },
          },
        ]),
      } as unknown as mapboxgl.Map;

      const mockRoute = {
        id: 'test-route',
        name: 'Test Route',
        color: '#FF0000',
        description: 'Test',
        icon: {} as IconDefinition,
        defaultWidth: 8,
        opacity: 1.0,
        distance: 5.0,
      };

      const mockLayer = {
        id: 'test-route',
        type: 'line',
        source: 'test-source',
        'source-layer': 'test-layer',
      } as mapboxgl.AnyLayer;

      const bounds = calculateRouteBounds(mockMap, mockRoute, mockLayer);

      expect(bounds).not.toBeNull();
    });

    it('should return null when layer has no source', () => {
      const mockMap = {} as mapboxgl.Map;

      const mockRoute = {
        id: 'test-route',
        name: 'Test Route',
        color: '#FF0000',
        description: 'Test',
        icon: {} as IconDefinition,
        defaultWidth: 8,
        opacity: 1.0,
        distance: 5.0,
      };

      const mockLayer = {
        id: 'test-route',
        type: 'line',
      } as mapboxgl.AnyLayer;

      const bounds = calculateRouteBounds(mockMap, mockRoute, mockLayer);

      expect(bounds).toBeNull();
    });

    it('should return null when no features found', () => {
      const mockMap = {
        querySourceFeatures: vi.fn().mockReturnValue([]),
      } as unknown as mapboxgl.Map;

      const mockRoute = {
        id: 'test-route',
        name: 'Test Route',
        color: '#FF0000',
        description: 'Test',
        icon: {} as IconDefinition,
        defaultWidth: 8,
        opacity: 1.0,
        distance: 5.0,
      };

      const mockLayer = {
        id: 'test-route',
        type: 'line',
        source: 'test-source',
        'source-layer': 'test-layer',
      } as mapboxgl.AnyLayer;

      const bounds = calculateRouteBounds(mockMap, mockRoute, mockLayer);

      expect(bounds).toBeNull();
    });
  });

  describe('findLocationInArray', () => {
    it('should find location by exact coordinates', () => {
      const locations = [
        { name: 'Location 1', latitude: 35.0456, longitude: -85.3097 },
        { name: 'Location 2', latitude: 35.0556, longitude: -85.3197 },
        { name: 'Location 3', latitude: 35.0656, longitude: -85.3297 },
      ];

      const result = findLocationInArray(locations, [-85.3197, 35.0556]);

      expect(result).toEqual(locations[1]);
    });

    it('should return undefined when location not found', () => {
      const locations = [
        { name: 'Location 1', latitude: 35.0456, longitude: -85.3097 },
      ];

      const result = findLocationInArray(locations, [-85.9999, 35.9999]);

      expect(result).toBeUndefined();
    });

    it('should work with empty array', () => {
      const result = findLocationInArray([], [-85.3097, 35.0456]);

      expect(result).toBeUndefined();
    });

    it('should match exact floating point coordinates', () => {
      const locations = [
        {
          name: 'Precise Location',
          latitude: 35.123456789,
          longitude: -85.987654321,
        },
      ];

      const result = findLocationInArray(
        locations,
        [-85.987654321, 35.123456789],
      );

      expect(result).toEqual(locations[0]);
    });
  });
});

describe('flyToBounds', () => {
  const mockBounds = {
    getWest: () => -85.5,
    getEast: () => -85.0,
    getNorth: () => 35.2,
    getSouth: () => 34.8,
  } as mapboxgl.LngLatBounds;

  it('should call map.fitBounds with padding and animation', () => {
    const mockMap = {
      fitBounds: vi.fn(),
    } as unknown as mapboxgl.Map;

    flyToBounds(mockMap, mockBounds);

    expect(mockMap.fitBounds).toHaveBeenCalledWith(mockBounds, {
      padding: 60,
      duration: 1000,
      essential: true,
    });
  });

  it('should pass bounds directly to fitBounds for any size', () => {
    const mockMap = {
      fitBounds: vi.fn(),
    } as unknown as mapboxgl.Map;

    const largeBounds = {
      getWest: () => -86.0,
      getEast: () => -84.0,
      getNorth: () => 36.0,
      getSouth: () => 34.0,
    } as mapboxgl.LngLatBounds;

    flyToBounds(mockMap, largeBounds);

    expect(mockMap.fitBounds).toHaveBeenCalledWith(largeBounds, {
      padding: 60,
      duration: 1000,
      essential: true,
    });
  });
});

describe('updateMtnBikeOpacity', () => {
  it('should set conditional expressions when a trail is selected', () => {
    const mockMap = {
      setPaintProperty: vi.fn(),
      getLayer: vi.fn().mockReturnValue(true),
    } as unknown as mapboxgl.Map;

    updateMtnBikeOpacity(mockMap, 'Five Points');

    // Main layer should get case expressions for line-opacity and line-width
    expect(mockMap.setPaintProperty).toHaveBeenCalledWith(
      MTN_BIKE_LAYER_ID,
      'line-opacity',
      ['case', ['==', ['get', 'Trail'], 'Five Points'], 0.9, 0.5],
    );
    expect(mockMap.setPaintProperty).toHaveBeenCalledWith(
      MTN_BIKE_LAYER_ID,
      'line-width',
      ['case', ['==', ['get', 'Trail'], 'Five Points'], 4, 3],
    );
  });

  it('should reset to default opacity and width when selectedTrailName is null', () => {
    const mockMap = {
      setPaintProperty: vi.fn(),
      getLayer: vi.fn().mockReturnValue(true),
    } as unknown as mapboxgl.Map;

    updateMtnBikeOpacity(mockMap, null);

    expect(mockMap.setPaintProperty).toHaveBeenCalledWith(
      MTN_BIKE_LAYER_ID,
      'line-opacity',
      0.5,
    );
    expect(mockMap.setPaintProperty).toHaveBeenCalledWith(
      MTN_BIKE_LAYER_ID,
      'line-width',
      3,
    );
  });

  it('should handle missing casing and glow layers gracefully', () => {
    const mainLayers = new Set([MTN_BIKE_LAYER_ID, 'Godsey Ridge Trails']);
    const mockMap = {
      setPaintProperty: vi.fn(),
      getLayer: vi.fn((id: string) =>
        mainLayers.has(id) ? { id } : undefined,
      ),
    } as unknown as mapboxgl.Map;

    expect(() => {
      updateMtnBikeOpacity(mockMap, 'Five Points');
    }).not.toThrow();

    // 2 properties per main layer, 2 layers = 4 calls (no casing/glow)
    expect(mockMap.setPaintProperty).toHaveBeenCalledTimes(4);
    expect(mockMap.setPaintProperty).toHaveBeenCalledWith(
      MTN_BIKE_LAYER_ID,
      'line-opacity',
      expect.anything(),
    );
  });

  it('should also update casing and glow layers when they exist and trail is selected', () => {
    const mockMap = {
      setPaintProperty: vi.fn(),
      getLayer: vi.fn().mockReturnValue(true),
    } as unknown as mapboxgl.Map;

    updateMtnBikeOpacity(mockMap, 'Five Points');

    // Casing layer updates
    expect(mockMap.setPaintProperty).toHaveBeenCalledWith(
      `${MTN_BIKE_LAYER_ID} Casing`,
      'line-opacity',
      expect.anything(),
    );
    expect(mockMap.setPaintProperty).toHaveBeenCalledWith(
      `${MTN_BIKE_LAYER_ID} Casing`,
      'line-width',
      expect.anything(),
    );

    // Glow layer updates
    expect(mockMap.setPaintProperty).toHaveBeenCalledWith(
      `${MTN_BIKE_LAYER_ID} Glow`,
      'line-opacity',
      expect.anything(),
    );
    expect(mockMap.setPaintProperty).toHaveBeenCalledWith(
      `${MTN_BIKE_LAYER_ID} Glow`,
      'line-width',
      expect.anything(),
    );
  });
});

describe('highlightMtnBikeArea', () => {
  function makeTrail(trailName: string, recArea: string): MountainBikeTrail {
    return {
      trailName,
      displayName: trailName,
      recArea,
      rating: 'intermediate',
      color: '#2563EB',
      icon: {} as IconDefinition,
    };
  }

  it('should highlight trails matching by recArea', () => {
    const mockMap = {
      setPaintProperty: vi.fn(),
      getLayer: vi.fn().mockReturnValue(true),
    } as unknown as mapboxgl.Map;

    const trails = [
      makeTrail('Trail A', 'Raccoon Mountain'),
      makeTrail('Trail B', 'Raccoon Mountain'),
      makeTrail('Trail C', 'Stringers Ridge'),
    ];

    highlightMtnBikeArea(mockMap, trails, 'Raccoon Mountain');

    // Should set a case/in match expression on the main layer for the area's
    // trail names (name-matched layers compare trailProp against the id list).
    const inArea = [
      'in',
      ['get', 'Trail'],
      ['literal', ['Trail A', 'Trail B']],
    ];
    expect(mockMap.setPaintProperty).toHaveBeenCalledWith(
      MTN_BIKE_LAYER_ID,
      'line-opacity',
      ['case', inArea, 0.9, 0.4],
    );
    expect(mockMap.setPaintProperty).toHaveBeenCalledWith(
      MTN_BIKE_LAYER_ID,
      'line-width',
      ['case', inArea, 3, 3],
    );
  });

  it('should do nothing when no trails match the area', () => {
    const mockMap = {
      setPaintProperty: vi.fn(),
      getLayer: vi.fn().mockReturnValue(true),
    } as unknown as mapboxgl.Map;

    const trails = [
      makeTrail('Trail A', 'Raccoon Mountain'),
      makeTrail('Trail B', 'Stringers Ridge'),
    ];

    highlightMtnBikeArea(mockMap, trails, 'Nonexistent Area');

    // No setPaintProperty calls for MTB layers since no trails matched
    expect(mockMap.setPaintProperty).not.toHaveBeenCalled();
  });
});

describe('TRAIL_LAYERS', () => {
  it('has entries for both mountain-bike and Godsey Ridge layers', () => {
    expect(TRAIL_LAYERS.length).toBeGreaterThanOrEqual(2);
    expect(
      TRAIL_LAYERS.find((l) => l.layerId === MTN_BIKE_LAYER_ID),
    ).toBeDefined();
    expect(
      TRAIL_LAYERS.find((l) => l.layerId === 'Godsey Ridge Trails'),
    ).toBeDefined();
  });

  it('mountain-bike layer reads the Trail property and identity-maps names', () => {
    const cfg = TRAIL_LAYERS.find((l) => l.layerId === MTN_BIKE_LAYER_ID);
    expect(cfg?.trailProp).toBe('Trail');
    expect(cfg?.toRawName('Five Points')).toBe('Five Points');
  });

  it('Godsey layer reads the Name property and resolves display names', () => {
    const cfg = TRAIL_LAYERS.find((l) => l.layerId === 'Godsey Ridge Trails');
    expect(cfg?.trailProp).toBe('Name');
    expect(cfg?.toRawName('Godsey Ridge Green')).toBe('Green as built');
  });
});

describe('TRAIL_METADATA', () => {
  it('has entries for all Godsey Ridge trails', () => {
    const godseyNames = [
      'Green as built',
      'Blue as built 1',
      'Blue as built 2',
      'Exper_Spur_As_built_21626',
      'Expert_As_Built_1',
      'Expert_As_Built_2',
    ];
    for (const name of godseyNames) {
      expect(TRAIL_METADATA[name]).toBeDefined();
      expect(TRAIL_METADATA[name].displayName).toContain('Godsey Ridge');
    }
  });

  it('all ratings have corresponding colors', () => {
    for (const meta of Object.values(TRAIL_METADATA)) {
      if (meta.rating) {
        expect(RATING_COLORS[meta.rating]).toBeDefined();
      }
    }
  });
});

describe('initMtnBikeColors', () => {
  it('sets line-color on all existing trail layers', () => {
    const mockMap = {
      getLayer: vi.fn().mockReturnValue({ id: 'test' }),
      setPaintProperty: vi.fn(),
    } as unknown as mapboxgl.Map;

    initMtnBikeColors(mockMap);

    // Should set color on each trail layer
    for (const cfg of TRAIL_LAYERS) {
      expect(mockMap.setPaintProperty).toHaveBeenCalledWith(
        cfg.layerId,
        'line-color',
        expect.anything(),
      );
    }
  });

  it('skips layers that do not exist', () => {
    const mockMap = {
      getLayer: vi.fn().mockReturnValue(undefined),
      setPaintProperty: vi.fn(),
    } as unknown as mapboxgl.Map;

    initMtnBikeColors(mockMap);

    expect(mockMap.setPaintProperty).not.toHaveBeenCalled();
  });
});

describe('hideStrayStyleLayers', () => {
  it('hides the baked-in TPL trails layer when present', () => {
    const mockMap = {
      getLayer: vi.fn().mockReturnValue({ id: 'test' }),
      setLayoutProperty: vi.fn(),
    } as unknown as mapboxgl.Map;

    hideStrayStyleLayers(mockMap);

    expect(mockMap.setLayoutProperty).toHaveBeenCalledWith(
      'Chatt_TPL_Trails-public',
      'visibility',
      'none',
    );
  });

  it('does nothing when the stray layer is absent from the style', () => {
    const mockMap = {
      getLayer: vi.fn().mockReturnValue(undefined),
      setLayoutProperty: vi.fn(),
    } as unknown as mapboxgl.Map;

    hideStrayStyleLayers(mockMap);

    expect(mockMap.setLayoutProperty).not.toHaveBeenCalled();
  });
});

describe('updateMtnBikeOpacity with Godsey Ridge trail', () => {
  it('reverse-maps display name to raw feature value for metadata layers', () => {
    const allLayers = new Set([
      MTN_BIKE_LAYER_ID,
      'Godsey Ridge Trails',
      `${MTN_BIKE_LAYER_ID} Casing`,
      `${MTN_BIKE_LAYER_ID} Glow`,
      'Godsey Ridge Trails Casing',
      'Godsey Ridge Trails Glow',
    ]);
    const mockMap = {
      setPaintProperty: vi.fn(),
      getLayer: vi.fn((id: string) => (allLayers.has(id) ? { id } : undefined)),
    } as unknown as mapboxgl.Map;

    updateMtnBikeOpacity(mockMap, 'Godsey Ridge Green');

    // The Godsey layer should use the raw name 'Green as built' in the expression
    expect(mockMap.setPaintProperty).toHaveBeenCalledWith(
      'Godsey Ridge Trails',
      'line-opacity',
      ['case', ['==', ['get', 'Name'], 'Green as built'], 0.9, 0.5],
    );
  });
});

describe('detectTrailAtPoint', () => {
  function createMockMap(
    overrides: Record<string, unknown> = {},
  ): mapboxgl.Map {
    return {
      project: vi.fn().mockReturnValue({ x: 100, y: 100 }),
      getCanvas: vi.fn().mockReturnValue({ width: 800, height: 600 }),
      getLayer: vi.fn().mockReturnValue(true),
      queryRenderedFeatures: vi.fn().mockReturnValue([]),
      ...overrides,
    } as unknown as mapboxgl.Map;
  }

  it('returns trail name when GPS point is on an MTB trail', () => {
    const mockMap = createMockMap({
      queryRenderedFeatures: vi.fn().mockReturnValue([
        {
          layer: { id: `${MTN_BIKE_LAYER_ID} Hit` },
          properties: { Trail: 'Big Forest' },
        },
      ]),
    });

    const result = detectTrailAtPoint(mockMap, [-85.3, 35.0]);
    expect(result).toBe('Big Forest');
    expect(mockMap.project).toHaveBeenCalled();
    expect(mockMap.queryRenderedFeatures).toHaveBeenCalledWith(
      { x: 100, y: 100 },
      { layers: expect.arrayContaining([`${MTN_BIKE_LAYER_ID} Hit`]) },
    );
  });

  it('returns display name for Godsey Ridge trails via TRAIL_METADATA', () => {
    const mockMap = createMockMap({
      queryRenderedFeatures: vi.fn().mockReturnValue([
        {
          layer: { id: 'Godsey Ridge Trails Hit' },
          properties: { Name: 'Green as built' },
        },
      ]),
    });

    const result = detectTrailAtPoint(mockMap, [-85.3, 35.0]);
    // TRAIL_METADATA maps 'Green as built' -> displayName
    const expected =
      TRAIL_METADATA['Green as built']?.displayName ?? 'Green as built';
    expect(result).toBe(expected);
  });

  it('returns null when no features found', () => {
    const mockMap = createMockMap();
    const result = detectTrailAtPoint(mockMap, [-85.3, 35.0]);
    expect(result).toBeNull();
  });

  it('returns null when point is off-screen', () => {
    const mockMap = createMockMap({
      project: vi.fn().mockReturnValue({ x: -10, y: 100 }),
    });

    const result = detectTrailAtPoint(mockMap, [-85.3, 35.0]);
    expect(result).toBeNull();
    expect(mockMap.queryRenderedFeatures).not.toHaveBeenCalled();
  });

  it('returns null when hit layers do not exist on map', () => {
    const mockMap = createMockMap({
      getLayer: vi.fn().mockReturnValue(undefined),
    });

    const result = detectTrailAtPoint(mockMap, [-85.3, 35.0]);
    expect(result).toBeNull();
    expect(mockMap.queryRenderedFeatures).not.toHaveBeenCalled();
  });

  it('returns null when feature has no trail property', () => {
    const mockMap = createMockMap({
      queryRenderedFeatures: vi.fn().mockReturnValue([
        {
          layer: { id: `${MTN_BIKE_LAYER_ID} Hit` },
          properties: {},
        },
      ]),
    });

    const result = detectTrailAtPoint(mockMap, [-85.3, 35.0]);
    expect(result).toBeNull();
  });
});

describe('toLngLatBounds', () => {
  it('returns undefined for undefined input', () => {
    expect(toLngLatBounds(undefined)).toBeUndefined();
  });

  it('returns LngLatBounds for a valid tuple', () => {
    const bounds = toLngLatBounds([-85.33, 35.03, -85.28, 35.06]);
    expect(bounds).toBeDefined();
    expect(bounds?.getWest()).toBeCloseTo(-85.33);
    expect(bounds?.getSouth()).toBeCloseTo(35.03);
    expect(bounds?.getEast()).toBeCloseTo(-85.28);
    expect(bounds?.getNorth()).toBeCloseTo(35.06);
  });
});

describe('OSM nationwide bike trails', () => {
  it('filter includes bike-permitted, mtb-scaled, and cycleway trails', () => {
    expect(OSM_BIKE_TRAIL_FILTER[0]).toBe('any');
    const serialized = JSON.stringify(OSM_BIKE_TRAIL_FILTER);
    expect(serialized).toContain('bicycle');
    expect(serialized).toContain('designated');
    expect(serialized).toContain('mtb:scale');
    expect(serialized).toContain('cycleway');
  });

  it('filter excludes mtb/cycleway trails that deny bike or general access', () => {
    const serialized = JSON.stringify(OSM_BIKE_TRAIL_FILTER);
    // The mtb:scale / cycleway branch is gated on NOT bike-denied and NOT
    // access-restricted (bicycle/access in no/private).
    expect(serialized).toContain('access');
    expect(serialized).toContain('private');
    expect(serialized).toContain('"no"');
  });

  it('POI filter targets parking and information points', () => {
    expect(OSM_POI_FILTER[0]).toBe('any');
    const serialized = JSON.stringify(OSM_POI_FILTER);
    expect(serialized).toContain('parking');
    expect(serialized).toContain('information');
  });

  it('ensureOsmTrailsSource adds the source, line, casing, and POI layers (hidden)', () => {
    const added: Record<string, mapboxgl.LayerSpecification> = {};
    const mockMap = {
      getSource: vi.fn().mockReturnValue(undefined),
      addSource: vi.fn(),
      getLayer: vi.fn((id: string) => added[id]),
      addLayer: vi.fn((layer: mapboxgl.LayerSpecification) => {
        added[layer.id] = layer;
      }),
    } as unknown as mapboxgl.Map;

    ensureOsmTrailsSource(mockMap);

    expect(mockMap.addSource).toHaveBeenCalledWith(
      OSM_TRAILS_SOURCE_ID,
      expect.objectContaining({ type: 'vector' }),
    );
    expect(added[OSM_TRAILS_LAYER_ID]).toBeDefined();
    expect(added[OSM_TRAILS_CASING_LAYER_ID]).toBeDefined();
    expect(added[OSM_TRAILS_HIT_LAYER_ID]).toBeDefined();
    expect(added[OSM_POI_LAYER_ID]).toBeDefined();
    expect(added[OSM_POI_LAYER_ID].type).toBe('symbol');
    expect(added[OSM_TRAILS_LAYER_ID].layout?.visibility).toBe('none');
    expect(added[OSM_TRAILS_HIT_LAYER_ID].layout?.visibility).toBe('none');
    expect(added[OSM_POI_LAYER_ID].layout?.visibility).toBe('none');
  });

  it('ensureOsmTrailsSource is idempotent', () => {
    const mockMap = {
      getSource: vi.fn().mockReturnValue({}),
      addSource: vi.fn(),
      getLayer: vi.fn().mockReturnValue({}),
      addLayer: vi.fn(),
    } as unknown as mapboxgl.Map;

    ensureOsmTrailsSource(mockMap);

    expect(mockMap.addSource).not.toHaveBeenCalled();
    expect(mockMap.addLayer).not.toHaveBeenCalled();
  });

  it('setOsmTrailsVisible flips visibility on both layers', () => {
    const mockMap = {
      getLayer: vi.fn().mockReturnValue({}),
      setLayoutProperty: vi.fn(),
    } as unknown as mapboxgl.Map;

    setOsmTrailsVisible(mockMap, true);
    expect(mockMap.setLayoutProperty).toHaveBeenCalledWith(
      OSM_TRAILS_LAYER_ID,
      'visibility',
      'visible',
    );

    setOsmTrailsVisible(mockMap, false);
    expect(mockMap.setLayoutProperty).toHaveBeenCalledWith(
      OSM_TRAILS_CASING_LAYER_ID,
      'visibility',
      'none',
    );
    expect(mockMap.setLayoutProperty).toHaveBeenCalledWith(
      OSM_POI_LAYER_ID,
      'visibility',
      'none',
    );
  });
});

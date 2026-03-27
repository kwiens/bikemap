import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  geocodeAddress,
  updateRouteOpacity,
  calculateZoomForBounds,
  calculateRouteBounds,
  findLocationInArray,
  flyToBounds,
  updateMtnBikeOpacity,
  highlightMtnBikeArea,
} from './map';
import type { BikeRoute, MountainBikeTrail } from '@/data/geo_data';
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
        },
        {
          id: 'route2',
          name: 'Route 2',
          color: '#00FF00',
          description: 'Test route 2',
          icon: {} as IconDefinition,
          defaultWidth: 8,
          opacity: 1.0,
        },
        {
          id: 'route3',
          name: 'Route 3',
          color: '#0000FF',
          description: 'Test route 3',
          icon: {} as IconDefinition,
          defaultWidth: 8,
          opacity: 1.0,
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
        },
        {
          id: 'route2',
          name: 'Route 2',
          color: '#00FF00',
          description: 'Test route 2',
          icon: {} as IconDefinition,
          defaultWidth: 8,
          opacity: 1.0,
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

  describe('calculateZoomForBounds', () => {
    it('should calculate zoom for mobile device', () => {
      const mockBounds = {
        getNorth: () => 35.1,
        getSouth: () => 35.0,
        getEast: () => -85.2,
        getWest: () => -85.3,
      } as mapboxgl.LngLatBounds;

      const zoom = calculateZoomForBounds(mockBounds, true);

      expect(zoom).toBeGreaterThanOrEqual(11);
      expect(zoom).toBeLessThanOrEqual(15);
    });

    it('should calculate zoom for desktop device', () => {
      const mockBounds = {
        getNorth: () => 35.1,
        getSouth: () => 35.0,
        getEast: () => -85.2,
        getWest: () => -85.3,
      } as mapboxgl.LngLatBounds;

      const zoom = calculateZoomForBounds(mockBounds, false);

      expect(zoom).toBeGreaterThanOrEqual(13);
      expect(zoom).toBeLessThanOrEqual(17);
    });

    it('should return higher zoom for smaller bounds', () => {
      const smallBounds = {
        getNorth: () => 35.05,
        getSouth: () => 35.04,
        getEast: () => -85.29,
        getWest: () => -85.3,
      } as mapboxgl.LngLatBounds;

      const largeBounds = {
        getNorth: () => 35.2,
        getSouth: () => 34.9,
        getEast: () => -85.0,
        getWest: () => -85.5,
      } as mapboxgl.LngLatBounds;

      const smallZoom = calculateZoomForBounds(smallBounds, false);
      const largeZoom = calculateZoomForBounds(largeBounds, false);

      expect(smallZoom).toBeGreaterThan(largeZoom);
    });

    it('should enforce minimum zoom levels', () => {
      const hugeBounds = {
        getNorth: () => 40.0,
        getSouth: () => 30.0,
        getEast: () => -80.0,
        getWest: () => -90.0,
      } as mapboxgl.LngLatBounds;

      const mobileZoom = calculateZoomForBounds(hugeBounds, true);
      const desktopZoom = calculateZoomForBounds(hugeBounds, false);

      expect(mobileZoom).toBe(11);
      expect(desktopZoom).toBe(13);
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

  it('should call map.flyTo with the center of the bounds', () => {
    const mockMap = {
      flyTo: vi.fn(),
    } as unknown as mapboxgl.Map;

    Object.defineProperty(window, 'innerWidth', {
      value: 1024,
      writable: true,
    });

    flyToBounds(mockMap, mockBounds);

    expect(mockMap.flyTo).toHaveBeenCalledWith(
      expect.objectContaining({
        center: [-85.25, 35],
        essential: true,
        duration: 1000,
      }),
    );
  });

  it('should use mobile zoom when window.innerWidth <= 768', () => {
    const mockMap = {
      flyTo: vi.fn(),
    } as unknown as mapboxgl.Map;

    Object.defineProperty(window, 'innerWidth', { value: 400, writable: true });

    flyToBounds(mockMap, mockBounds);

    const callArgs = (mockMap.flyTo as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    const mobileZoom = callArgs.zoom;

    // Mobile zoom uses calculateZoomForBounds(bounds, true) which uses Math.max(11, 15 - maxDiff * 100)
    const expectedZoom = calculateZoomForBounds(mockBounds, true);
    expect(mobileZoom).toBe(expectedZoom);
  });

  it('should use desktop zoom when window.innerWidth > 768', () => {
    const mockMap = {
      flyTo: vi.fn(),
    } as unknown as mapboxgl.Map;

    Object.defineProperty(window, 'innerWidth', {
      value: 1024,
      writable: true,
    });

    flyToBounds(mockMap, mockBounds);

    const callArgs = (mockMap.flyTo as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    const desktopZoom = callArgs.zoom;

    // Desktop zoom uses calculateZoomForBounds(bounds, false) which uses Math.max(13, 17 - maxDiff * 100)
    const expectedZoom = calculateZoomForBounds(mockBounds, false);
    expect(desktopZoom).toBe(expectedZoom);
  });

  it('should compute center as midpoint of bounds', () => {
    const mockMap = {
      flyTo: vi.fn(),
    } as unknown as mapboxgl.Map;

    Object.defineProperty(window, 'innerWidth', {
      value: 1024,
      writable: true,
    });

    const asymmetricBounds = {
      getWest: () => -86.0,
      getEast: () => -84.0,
      getNorth: () => 36.0,
      getSouth: () => 34.0,
    } as mapboxgl.LngLatBounds;

    flyToBounds(mockMap, asymmetricBounds);

    expect(mockMap.flyTo).toHaveBeenCalledWith(
      expect.objectContaining({
        center: [-85.0, 35.0],
      }),
    );
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
      'SORBA Regional Trails',
      'line-opacity',
      ['case', ['==', ['get', 'Trail'], 'Five Points'], 0.9, 0.15],
    );
    expect(mockMap.setPaintProperty).toHaveBeenCalledWith(
      'SORBA Regional Trails',
      'line-width',
      ['case', ['==', ['get', 'Trail'], 'Five Points'], 4, 2],
    );
  });

  it('should reset to default opacity and width when selectedTrailName is null', () => {
    const mockMap = {
      setPaintProperty: vi.fn(),
      getLayer: vi.fn().mockReturnValue(true),
    } as unknown as mapboxgl.Map;

    updateMtnBikeOpacity(mockMap, null);

    expect(mockMap.setPaintProperty).toHaveBeenCalledWith(
      'SORBA Regional Trails',
      'line-opacity',
      0.15,
    );
    expect(mockMap.setPaintProperty).toHaveBeenCalledWith(
      'SORBA Regional Trails',
      'line-width',
      2,
    );
  });

  it('should handle missing casing and glow layers gracefully', () => {
    const mainLayers = new Set([
      'SORBA Regional Trails',
      'Godsey Ridge Trails',
    ]);
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
      'SORBA Regional Trails',
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
      'SORBA Regional Trails Casing',
      'line-opacity',
      expect.anything(),
    );
    expect(mockMap.setPaintProperty).toHaveBeenCalledWith(
      'SORBA Regional Trails Casing',
      'line-width',
      expect.anything(),
    );

    // Glow layer updates
    expect(mockMap.setPaintProperty).toHaveBeenCalledWith(
      'SORBA Regional Trails Glow',
      'line-opacity',
      expect.anything(),
    );
    expect(mockMap.setPaintProperty).toHaveBeenCalledWith(
      'SORBA Regional Trails Glow',
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

    // Should set match expression on main layer with matching trail names
    expect(mockMap.setPaintProperty).toHaveBeenCalledWith(
      'SORBA Regional Trails',
      'line-opacity',
      ['match', ['get', 'Trail'], ['Trail A', 'Trail B'], 0.9, 0.1],
    );
    expect(mockMap.setPaintProperty).toHaveBeenCalledWith(
      'SORBA Regional Trails',
      'line-width',
      ['match', ['get', 'Trail'], ['Trail A', 'Trail B'], 3, 2],
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

    // No setPaintProperty calls for SORBA layers since no trails matched
    expect(mockMap.setPaintProperty).not.toHaveBeenCalled();
  });
});

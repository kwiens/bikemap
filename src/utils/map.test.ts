import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  geocodeAddress,
  updateRouteOpacity,
  calculateZoomForBounds,
  calculateRouteBounds,
  findLocationInArray,
} from './map';
import type { BikeRoute } from '@/data/geo_data';
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

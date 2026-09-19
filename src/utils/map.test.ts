import type * as GeoJSON from 'geojson';
/** @vitest-environment jsdom */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  geocodeAddress,
  updateRouteOpacity,
  calculateRouteBounds,
  findLocationInArray,
  createArrowSdfImage,
  syncRouteArrowLayer,
  removeOverlappingSegments,
  applyArrowDirectionOverrides,
  flyToBounds,
  updateMtnBikeOpacity,
  highlightMtnBikeArea,
  initMtnBikeColors,
  hideStrayStyleLayers,
  detectTrailAtPoint,
  toLngLatBounds,
  loadCuratedGeojson,
  TRAIL_LAYERS,
  BIKE_ROUTE_LAYER_ID,
  BIKE_ROUTE_CASING_LAYER_ID,
  removeStyleOwnedBikeRoutes,
  loadBikeRouteOptimizedStyle,
  queryNearbyLineFeatures,
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
import {
  STYLE_OWNED_ROUTE_LAYER_IDS,
  STYLE_OWNED_ROUTE_TILESET_IDS,
} from '@/data/mapbox-style';
import type { IconDefinition } from '@fortawesome/free-solid-svg-icons';
import type mapboxgl from 'mapbox-gl';

describe('Mapbox Geo Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createArrowSdfImage', () => {
    it('should return ImageData with correct dimensions', () => {
      const mockImageData = {
        width: 20,
        height: 20,
        data: new Uint8ClampedArray(20 * 20 * 4),
      };
      const mockCtx = {
        clearRect: vi.fn(),
        strokeStyle: '',
        lineWidth: 0,
        lineCap: '',
        lineJoin: '',
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        stroke: vi.fn(),
        getImageData: vi.fn().mockReturnValue(mockImageData),
      };
      const mockCanvas = {
        width: 0,
        height: 0,
        getContext: vi.fn().mockReturnValue(mockCtx),
      };
      vi.spyOn(document, 'createElement').mockReturnValue(
        mockCanvas as unknown as HTMLElement,
      );

      const result = createArrowSdfImage(20);

      expect(result.width).toBe(20);
      expect(result.height).toBe(20);
      expect(mockCanvas.getContext).toHaveBeenCalledWith('2d');
      expect(mockCtx.stroke).toHaveBeenCalled();

      vi.restoreAllMocks();
    });

    it('should use custom size parameter', () => {
      const mockImageData = {
        width: 32,
        height: 32,
        data: new Uint8ClampedArray(32 * 32 * 4),
      };
      const mockCtx = {
        clearRect: vi.fn(),
        strokeStyle: '',
        lineWidth: 0,
        lineCap: '',
        lineJoin: '',
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        stroke: vi.fn(),
        getImageData: vi.fn().mockReturnValue(mockImageData),
      };
      const mockCanvas = {
        width: 0,
        height: 0,
        getContext: vi.fn().mockReturnValue(mockCtx),
      };
      vi.spyOn(document, 'createElement').mockReturnValue(
        mockCanvas as unknown as HTMLElement,
      );

      const result = createArrowSdfImage(32);

      expect(result.width).toBe(32);
      expect(result.height).toBe(32);
      expect(mockCanvas.width).toBe(32);
      expect(mockCanvas.height).toBe(32);

      vi.restoreAllMocks();
    });
  });

  describe('removeOverlappingSegments', () => {
    it('should keep non-overlapping segments unchanged', () => {
      const features: GeoJSON.Feature[] = [
        {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: [
              [-85.3, 35.0],
              [-85.31, 35.01],
              [-85.32, 35.02],
            ],
          },
        },
      ];

      const result = removeOverlappingSegments(features);
      expect(result).toHaveLength(1);
      expect(result[0].geometry.coordinates).toHaveLength(3);
    });

    it('should remove shared edges while preserving unique runs', () => {
      const features: GeoJSON.Feature[] = [
        {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: [
              [-85.3, 35.0],
              [-85.31, 35.01],
              [-85.32, 35.02],
              [-85.33, 35.03],
            ],
          },
        },
        {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: [
              [-85.34, 35.04],
              [-85.32, 35.02],
              [-85.31, 35.01],
              [-85.35, 35.05],
            ],
          },
        },
      ];

      const result = removeOverlappingSegments(features);

      expect(result.map((feature) => feature.geometry.coordinates)).toEqual([
        [
          [-85.3, 35.0],
          [-85.31, 35.01],
        ],
        [
          [-85.32, 35.02],
          [-85.33, 35.03],
        ],
        [
          [-85.34, 35.04],
          [-85.32, 35.02],
        ],
        [
          [-85.31, 35.01],
          [-85.35, 35.05],
        ],
      ]);
    });

    it('should keep paths that only cross at one coordinate', () => {
      const features: GeoJSON.Feature[] = [
        {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: [
              [-85.3, 35.0],
              [-85.31, 35.01],
              [-85.32, 35.02],
            ],
          },
        },
        {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: [
              [-85.34, 35.04],
              [-85.31, 35.01],
              [-85.35, 35.05],
            ],
          },
        },
      ];

      const result = removeOverlappingSegments(features);

      expect(result).toHaveLength(2);
      expect(result.map((feature) => feature.geometry.coordinates)).toEqual(
        features.map(
          (feature) => (feature.geometry as GeoJSON.LineString).coordinates,
        ),
      );
    });

    it('should not treat tile fragments of the same feature as overlap', () => {
      const features: GeoJSON.Feature[] = [
        {
          type: 'Feature',
          id: 42,
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: [
              [-85.3, 35.0],
              [-85.31, 35.01],
              [-85.32, 35.02],
            ],
          },
        },
        {
          type: 'Feature',
          id: 42,
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: [
              [-85.31, 35.01],
              [-85.32, 35.02],
              [-85.33, 35.03],
            ],
          },
        },
      ];

      expect(removeOverlappingSegments(features)).toHaveLength(2);
    });

    it('should return empty array for empty input', () => {
      expect(removeOverlappingSegments([])).toHaveLength(0);
    });
  });

  describe('applyArrowDirectionOverrides', () => {
    it('should reverse only consecutive edges inside configured bounds', () => {
      const features: GeoJSON.Feature<GeoJSON.LineString>[] = [
        {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: [
              [-85.3075, 35.051],
              [-85.3064, 35.051],
              [-85.3064, 35.0497],
              [-85.3058, 35.0497],
            ],
          },
        },
      ];

      const result = applyArrowDirectionOverrides(features, [
        [-85.3076, 35.0509, -85.3063, 35.0511],
        [-85.3065, 35.0496, -85.3063, 35.0511],
      ]);

      expect(result.map((feature) => feature.geometry.coordinates)).toEqual([
        [
          [-85.3064, 35.0497],
          [-85.3064, 35.051],
          [-85.3075, 35.051],
        ],
        [
          [-85.3064, 35.0497],
          [-85.3058, 35.0497],
        ],
      ]);
    });

    it('should leave geometry unchanged without overrides', () => {
      const features: GeoJSON.Feature<GeoJSON.LineString>[] = [
        {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: [
              [-85.3, 35],
              [-85.31, 35.01],
            ],
          },
        },
      ];

      expect(applyArrowDirectionOverrides(features)).toBe(features);
    });
  });

  describe('syncRouteArrowLayer', () => {
    const route: BikeRoute = {
      id: 'route1',
      name: 'Route 1',
      color: '#FF0000',
      description: 'Test route',
      icon: {} as IconDefinition,
      defaultWidth: 8,
      opacity: 1,
      distance: 5,
    };

    it('should build a filtered GeoJSON source for vector route arrows', () => {
      const filter: mapboxgl.FilterSpecification = [
        '==',
        ['get', 'route'],
        'route1',
      ];
      const features: GeoJSON.Feature[] = [
        {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: [
              [-85.3, 35.0],
              [-85.31, 35.01],
            ],
          },
        },
      ];
      const mockMap = {
        querySourceFeatures: vi.fn().mockReturnValue(features),
        getSource: vi.fn().mockReturnValue(undefined),
        addSource: vi.fn(),
        getLayer: vi.fn().mockReturnValue(undefined),
        addLayer: vi.fn(),
      } as unknown as mapboxgl.Map;
      const layer = {
        id: route.id,
        type: 'line',
        source: 'composite',
        'source-layer': 'routes',
        filter,
      } as mapboxgl.AnyLayer;

      syncRouteArrowLayer(mockMap, route, layer, 'road-label');

      expect(mockMap.querySourceFeatures).toHaveBeenCalledWith('composite', {
        sourceLayer: 'routes',
        filter,
      });
      expect(mockMap.addSource).toHaveBeenCalledWith('route1-arrows-source', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features,
        },
      });
      expect(mockMap.addLayer).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'route1-arrows',
          source: 'route1-arrows-source',
          paint: {
            'icon-color': route.color,
            'icon-opacity': 0,
          },
        }),
        'road-label',
      );
    });

    it('should refresh an existing arrow source for GeoJSON routes', () => {
      const setData = vi.fn();
      const filter: mapboxgl.FilterSpecification = [
        '==',
        ['get', 'id'],
        route.id,
      ];
      const mockMap = {
        querySourceFeatures: vi.fn().mockReturnValue([]),
        getSource: vi.fn().mockReturnValue({ setData }),
        addSource: vi.fn(),
        getLayer: vi.fn().mockReturnValue(true),
        addLayer: vi.fn(),
      } as unknown as mapboxgl.Map;
      const layer = {
        id: route.id,
        type: 'line',
        source: 'inline-routes-source',
        filter,
      } as mapboxgl.AnyLayer;

      syncRouteArrowLayer(mockMap, route, layer);

      expect(mockMap.querySourceFeatures).toHaveBeenCalledWith(
        'inline-routes-source',
        { filter },
      );
      expect(setData).toHaveBeenCalledWith({
        type: 'FeatureCollection',
        features: [],
      });
      expect(mockMap.addSource).not.toHaveBeenCalled();
      expect(mockMap.addLayer).not.toHaveBeenCalled();
    });

    it('filters the shared route source to the requested route', () => {
      const mockMap = {
        querySourceFeatures: vi.fn().mockReturnValue([]),
        getSource: vi.fn().mockReturnValue(undefined),
        addSource: vi.fn(),
        getLayer: vi.fn().mockReturnValue(undefined),
        addLayer: vi.fn(),
      } as unknown as mapboxgl.Map;
      const layer = {
        id: BIKE_ROUTE_LAYER_ID,
        type: 'line',
        source: 'bike-routes-source',
      } as mapboxgl.AnyLayer;

      syncRouteArrowLayer(mockMap, route, layer);

      expect(mockMap.querySourceFeatures).toHaveBeenCalledWith(
        'bike-routes-source',
        { filter: ['==', ['get', 'id'], route.id] },
      );
    });

    it('should skip routes configured to hide arrows', () => {
      const mockMap = {
        querySourceFeatures: vi.fn(),
      } as unknown as mapboxgl.Map;

      syncRouteArrowLayer(mockMap, { ...route, hideArrows: true }, {
        id: route.id,
        type: 'line',
        source: 'composite',
      } as mapboxgl.AnyLayer);

      expect(mockMap.querySourceFeatures).not.toHaveBeenCalled();
    });
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
    it('updates shared route layers and preserves selected-route arrows', () => {
      const mockMap = {
        setPaintProperty: vi.fn(),
        getLayer: vi.fn((id: string) =>
          [
            BIKE_ROUTE_LAYER_ID,
            BIKE_ROUTE_CASING_LAYER_ID,
            'route2-arrows',
          ].includes(id)
            ? { id }
            : undefined,
        ),
      } as unknown as mapboxgl.Map;
      const routes: BikeRoute[] = [
        {
          id: 'route1',
          name: 'Route 1',
          color: '#FF0000',
          description: 'Test route',
          icon: {} as IconDefinition,
          defaultWidth: 8,
          opacity: 1,
          distance: 5,
        },
        {
          id: 'route2',
          name: 'Route 2',
          color: '#00FF00',
          description: 'Test route',
          icon: {} as IconDefinition,
          defaultWidth: 6,
          opacity: 1,
          distance: 4,
        },
      ];

      updateRouteOpacity(mockMap, routes, 'route2', {
        selected: 0.8,
        unselected: 0.2,
      });

      expect(mockMap.setPaintProperty).toHaveBeenCalledWith(
        BIKE_ROUTE_LAYER_ID,
        'line-opacity',
        ['case', ['==', ['get', 'id'], 'route2'], 0.8, 0.2],
      );
      expect(mockMap.setPaintProperty).toHaveBeenCalledWith(
        'route2-arrows',
        'icon-opacity',
        0.8,
      );
      expect(mockMap.setPaintProperty).toHaveBeenCalledTimes(4);
    });

    it('should update opacity for selected and unselected routes', () => {
      const mockMap = {
        setPaintProperty: vi.fn(),
        getLayer: vi.fn((id: string) =>
          id === BIKE_ROUTE_LAYER_ID ? undefined : { id },
        ),
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
        'route1-casing',
        'line-opacity',
        0.16000000000000003,
      );
      expect(mockMap.setPaintProperty).toHaveBeenCalledWith(
        'route1-casing',
        'line-width',
        10,
      );
      expect(mockMap.setPaintProperty).toHaveBeenCalledWith(
        'route1-arrows',
        'icon-opacity',
        0,
      );
      expect(mockMap.setPaintProperty).toHaveBeenCalledWith(
        'route2',
        'line-opacity',
        0.8,
      );
      expect(mockMap.setPaintProperty).toHaveBeenCalledWith(
        'route2-casing',
        'line-opacity',
        0.6400000000000001,
      );
      expect(mockMap.setPaintProperty).toHaveBeenCalledWith(
        'route2-casing',
        'line-width',
        12,
      );
      expect(mockMap.setPaintProperty).toHaveBeenCalledWith(
        'route2-arrows',
        'icon-opacity',
        0.8,
      );
      expect(mockMap.setPaintProperty).toHaveBeenCalledWith(
        'route3',
        'line-opacity',
        0.2,
      );
      expect(mockMap.setPaintProperty).toHaveBeenCalledWith(
        'route3-casing',
        'line-opacity',
        0.16000000000000003,
      );
      expect(mockMap.setPaintProperty).toHaveBeenCalledWith(
        'route3-casing',
        'line-width',
        10,
      );
      expect(mockMap.setPaintProperty).toHaveBeenCalledWith(
        'route3-arrows',
        'icon-opacity',
        0,
      );
      expect(mockMap.setPaintProperty).toHaveBeenCalledTimes(12);
    });

    it('should skip arrow layers that do not exist', () => {
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
      ];

      updateRouteOpacity(mockMap, routes, 'route1', {
        selected: 0.8,
        unselected: 0.2,
      });

      expect(mockMap.setPaintProperty).toHaveBeenCalledWith(
        'route1',
        'line-opacity',
        0.8,
      );
      expect(mockMap.setPaintProperty).not.toHaveBeenCalledWith(
        'route1-arrows',
        expect.anything(),
        expect.anything(),
      );
      expect(mockMap.setPaintProperty).toHaveBeenCalledTimes(1);
    });

    it('should set all routes to unselected when selectedId is null', () => {
      const mockMap = {
        setPaintProperty: vi.fn(),
        getLayer: vi.fn((id: string) =>
          id === BIKE_ROUTE_LAYER_ID ? undefined : { id },
        ),
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
        'route1-casing',
        'line-opacity',
        0.08000000000000002,
      );
      expect(mockMap.setPaintProperty).toHaveBeenCalledWith(
        'route1-arrows',
        'icon-opacity',
        0,
      );
      expect(mockMap.setPaintProperty).toHaveBeenCalledWith(
        'route2',
        'line-opacity',
        0.1,
      );
      expect(mockMap.setPaintProperty).toHaveBeenCalledWith(
        'route2-casing',
        'line-opacity',
        0.08000000000000002,
      );
      expect(mockMap.setPaintProperty).toHaveBeenCalledWith(
        'route2-arrows',
        'icon-opacity',
        0,
      );
      expect(mockMap.setPaintProperty).toHaveBeenCalledTimes(8);
    });

    it('should handle errors when setting paint property', () => {
      const mockMap = {
        setPaintProperty: vi.fn().mockImplementation(() => {
          throw new Error('Layer not found');
        }),
        getLayer: vi.fn().mockReturnValue(undefined),
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
      setLayoutProperty: vi.fn(),
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
      setLayoutProperty: vi.fn(),
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
    expect(mockMap.setLayoutProperty).toHaveBeenCalledWith(
      `${MTN_BIKE_LAYER_ID} Glow`,
      'visibility',
      'none',
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
      setLayoutProperty: vi.fn(),
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
    expect(mockMap.setLayoutProperty).toHaveBeenCalledWith(
      `${MTN_BIKE_LAYER_ID} Glow`,
      'visibility',
      'visible',
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
      setLayoutProperty: vi.fn(),
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

// A city whose curated layer reads from the database-backed API also carries
// the static file the database was seeded from. Without the fallback, a 503 or
// an unseeded database draws no lines while the sidebar still lists every
// trail — so clicking one zooms to blank basemap.
describe('loadCuratedGeojson', () => {
  const API = '/api/map/trails?city=bend';
  const STATIC = '/data/bend/trails.geojson';

  const trails = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { Trail: "Phil's Trail" },
        geometry: {
          type: 'LineString',
          coordinates: [
            [-121.4, 44.0],
            [-121.5, 44.1],
          ],
        },
      },
    ],
  };
  const empty = { type: 'FeatureCollection', features: [] };

  function mockMap() {
    const setData = vi.fn();
    const map = {
      getSource: vi.fn().mockReturnValue({ setData }),
    } as unknown as mapboxgl.Map;
    return { map, setData };
  }

  /** A number stands for a failing status, an Error for a network failure. */
  function mockFetch(byUrl: Record<string, unknown>) {
    global.fetch = vi.fn(async (url: string) => {
      const answer = byUrl[url];
      if (answer instanceof Error) {
        throw answer;
      }
      if (typeof answer === 'number') {
        return { ok: false, status: answer };
      }
      return { ok: true, json: async () => answer };
    }) as unknown as typeof fetch;
  }

  it('draws the API response and never fetches the fallback', async () => {
    const { map, setData } = mockMap();
    mockFetch({ [API]: trails, [STATIC]: empty });

    await loadCuratedGeojson(map, 'bend-mtb-trails-source', API, STATIC);

    expect(setData).toHaveBeenCalledWith(trails);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('falls back to the static file when the API fails', async () => {
    const { map, setData } = mockMap();
    mockFetch({ [API]: 503, [STATIC]: trails });

    await loadCuratedGeojson(map, 'bend-mtb-trails-source', API, STATIC);

    expect(setData).toHaveBeenCalledWith(trails);
  });

  it('falls back when the API answers with no features', async () => {
    // An unseeded database is a 200 with an empty FeatureCollection.
    const { map, setData } = mockMap();
    mockFetch({ [API]: empty, [STATIC]: trails });

    await loadCuratedGeojson(map, 'bend-mtb-trails-source', API, STATIC);

    expect(setData).toHaveBeenCalledWith(trails);
  });

  it('keeps the empty API answer when the fallback is unreachable too', async () => {
    const { map, setData } = mockMap();
    mockFetch({ [API]: empty, [STATIC]: new Error('offline') });

    await loadCuratedGeojson(map, 'bend-mtb-trails-source', API, STATIC);

    expect(setData).toHaveBeenCalledWith(empty);
  });

  it('leaves the source alone when neither URL answers', async () => {
    const { map, setData } = mockMap();
    mockFetch({ [API]: 503, [STATIC]: 404 });

    await loadCuratedGeojson(map, 'bend-mtb-trails-source', API, STATIC);

    expect(setData).not.toHaveBeenCalled();
  });

  it('tolerates the source having gone away mid-fetch', async () => {
    const map = {
      getSource: vi.fn().mockReturnValue(undefined),
    } as unknown as mapboxgl.Map;
    mockFetch({ [API]: trails });

    await expect(
      loadCuratedGeojson(map, 'bend-mtb-trails-source', API, STATIC),
    ).resolves.toBeUndefined();
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
      setLayoutProperty: vi.fn(),
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
          layer: { id: MTN_BIKE_LAYER_ID },
          properties: { Trail: 'Big Forest' },
        },
      ]),
    });

    const result = detectTrailAtPoint(mockMap, [-85.3, 35.0]);
    expect(result).toBe('Big Forest');
    expect(mockMap.project).toHaveBeenCalled();
    expect(mockMap.queryRenderedFeatures).toHaveBeenCalledWith(
      [
        [88, 88],
        [112, 112],
      ],
      { layers: expect.arrayContaining([MTN_BIKE_LAYER_ID]) },
    );
  });

  it('returns display name for Godsey Ridge trails via TRAIL_METADATA', () => {
    const mockMap = createMockMap({
      queryRenderedFeatures: vi.fn().mockReturnValue([
        {
          layer: { id: 'Godsey Ridge Trails' },
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

  it('returns null when visible trail layers do not exist on map', () => {
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
          layer: { id: MTN_BIKE_LAYER_ID },
          properties: {},
        },
      ]),
    });

    const result = detectTrailAtPoint(mockMap, [-85.3, 35.0]);
    expect(result).toBeNull();
  });
});

describe('queryNearbyLineFeatures', () => {
  it('queries existing layers in a touch-friendly screen-space box', () => {
    const queryRenderedFeatures = vi.fn().mockReturnValue([]);
    const mockMap = {
      getLayer: vi.fn((id: string) =>
        id === 'visible-line' ? { id } : undefined,
      ),
      queryRenderedFeatures,
    } as unknown as mapboxgl.Map;

    queryNearbyLineFeatures(
      mockMap,
      { x: 40, y: 60 },
      ['visible-line', 'missing-line'],
      10,
    );

    expect(queryRenderedFeatures).toHaveBeenCalledWith(
      [
        [30, 50],
        [50, 70],
      ],
      { layers: ['visible-line'] },
    );
  });
});

describe('removeStyleOwnedBikeRoutes', () => {
  it('removes route layers and tilesets while preserving trail tilesets', () => {
    const routeTileset = STYLE_OWNED_ROUTE_TILESET_IDS[0];
    const style = {
      version: 8,
      sources: {
        composite: {
          type: 'vector',
          url: `mapbox://mapbox.mapbox-streets-v8,${routeTileset},swuller.cvsl09xq?style=test`,
        },
      },
      layers: [
        {
          id: STYLE_OWNED_ROUTE_LAYER_IDS[0],
          type: 'line',
          source: 'composite',
          'source-layer': 'route',
        },
        {
          id: 'trail-layer',
          type: 'line',
          source: 'composite',
          'source-layer': 'trail',
        },
      ],
    } satisfies mapboxgl.StyleSpecification;

    const result = removeStyleOwnedBikeRoutes(style);
    const composite = result.sources.composite as { url: string };

    expect(result.layers.map((layer) => layer.id)).toEqual(['trail-layer']);
    expect(composite.url).not.toContain(routeTileset);
    expect(composite.url).toContain('swuller.cvsl09xq');
    expect(composite.url).toContain('?style=test');
    expect(style.layers).toHaveLength(2);
  });

  it('leaves Studio-owned routes intact for cities without runtime GeoJSON', async () => {
    const previousFetch = global.fetch;
    const fetchMock = vi.fn();
    global.fetch = fetchMock;

    try {
      const styleUrl = 'mapbox://styles/example/style?optimize=true';
      const result = await loadBikeRouteOptimizedStyle(
        styleUrl,
        'test-token',
        false,
      );

      expect(result).toBe(styleUrl);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      global.fetch = previousFetch;
    }
  });

  it('fetches and prunes an optimized style for runtime route GeoJSON', async () => {
    const previousFetch = global.fetch;
    const routeTileset = STYLE_OWNED_ROUTE_TILESET_IDS[0];
    const style = {
      version: 8,
      sources: {
        composite: {
          type: 'vector',
          url: `mapbox://mapbox.mapbox-streets-v8,${routeTileset}`,
        },
      },
      layers: [
        {
          id: STYLE_OWNED_ROUTE_LAYER_IDS[0],
          type: 'line',
          source: 'composite',
        },
      ],
    } satisfies mapboxgl.StyleSpecification;
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => style,
    });
    global.fetch = fetchMock;
    const controller = new AbortController();

    try {
      const result = (await loadBikeRouteOptimizedStyle(
        'mapbox://styles/example/style?optimize=true',
        'test-token',
        true,
        controller.signal,
      )) as mapboxgl.StyleSpecification;
      const request = fetchMock.mock.calls[0][0] as URL;

      expect(request.origin).toBe('https://api.mapbox.com');
      expect(request.pathname).toBe('/styles/v1/example/style');
      expect(request.searchParams.get('optimize')).toBe('true');
      expect(request.searchParams.get('access_token')).toBe('test-token');
      expect(fetchMock).toHaveBeenCalledWith(request, {
        signal: controller.signal,
      });
      expect(result.layers).toEqual([]);
      expect((result.sources.composite as { url: string }).url).not.toContain(
        routeTileset,
      );
    } finally {
      global.fetch = previousFetch;
    }
  });

  it('propagates teardown aborts instead of loading the fallback style', async () => {
    const previousFetch = global.fetch;
    const controller = new AbortController();
    const abortError = new DOMException('Aborted', 'AbortError');
    const fetchMock = vi.fn().mockRejectedValue(abortError);
    global.fetch = fetchMock;
    controller.abort();

    try {
      await expect(
        loadBikeRouteOptimizedStyle(
          'mapbox://styles/example/style?optimize=true',
          'test-token',
          true,
          controller.signal,
        ),
      ).rejects.toBe(abortError);
    } finally {
      global.fetch = previousFetch;
    }
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

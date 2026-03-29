import { vi } from 'vitest';
import { act } from '@testing-library/react';
import type { IconDefinition } from '@fortawesome/free-solid-svg-icons';
import type { BikeRoute, MountainBikeTrail } from '@/data/geo_data';
import type { RidePoint, StoredRidePoint } from '@/data/ride';
import type mapboxgl from 'mapbox-gl';

const STUB_ICON = {} as IconDefinition;
const FIXED_TIMESTAMP = 1700000000000;

export function mockMap(overrides: Record<string, unknown> = {}): mapboxgl.Map {
  return {
    setPaintProperty: vi.fn(),
    getLayer: vi.fn().mockReturnValue(undefined),
    getSource: vi.fn(),
    addLayer: vi.fn(),
    addSource: vi.fn(),
    removeLayer: vi.fn(),
    removeSource: vi.fn(),
    setLayoutProperty: vi.fn(),
    fitBounds: vi.fn(),
    querySourceFeatures: vi.fn().mockReturnValue([]),
    ...overrides,
  } as unknown as mapboxgl.Map;
}

export function mockBikeRoute(overrides: Partial<BikeRoute> = {}): BikeRoute {
  return {
    id: 'test-route',
    name: 'Test Route',
    color: '#FF0000',
    description: 'A test route',
    icon: STUB_ICON,
    defaultWidth: 8,
    opacity: 1.0,
    ...overrides,
  };
}

export function mockMountainBikeTrail(
  overrides: Partial<MountainBikeTrail> = {},
): MountainBikeTrail {
  return {
    trailName: 'Test Trail',
    displayName: 'Test Trail',
    recArea: 'Test Area',
    rating: 'intermediate',
    color: '#2563EB',
    icon: STUB_ICON,
    ...overrides,
  };
}

export function mockRidePoint(overrides: Partial<RidePoint> = {}): RidePoint {
  return {
    lng: -85.3,
    lat: 35.0,
    altitude: 200,
    accuracy: 5,
    speed: 3.5,
    timestamp: FIXED_TIMESTAMP,
    ...overrides,
  };
}

export function mockStoredRidePoint(
  overrides: Partial<StoredRidePoint> = {},
): StoredRidePoint {
  return {
    lng: -85.3,
    lat: 35.0,
    altitude: 200,
    timestamp: FIXED_TIMESTAMP,
    ...overrides,
  };
}

export function mockBounds(
  overrides: Partial<Record<string, () => number>> = {},
): mapboxgl.LngLatBounds {
  return {
    getWest: () => -85.5,
    getEast: () => -85.0,
    getNorth: () => 35.2,
    getSouth: () => 34.8,
    ...overrides,
  } as mapboxgl.LngLatBounds;
}

export function dispatch(
  event: string,
  detail?: Record<string, unknown>,
): void {
  act(() => {
    window.dispatchEvent(new CustomEvent(event, { detail }));
  });
}

/** @vitest-environment jsdom */

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, render, cleanup, screen } from '@testing-library/react';
import { faMountain, faRoute } from '@fortawesome/free-solid-svg-icons';
import { activeCityId } from '@/config/map.config';
import type { BikeRoute } from '@/data/bike-routes';
import type { MountainBikeTrail } from '@/data/mountain-bike-trails';
import { MAP_EVENTS } from '@/events';
import { useMapSelection } from '@/components/map-selection';

// Mock next/dynamic to render a simple placeholder instead of the real Map
vi.mock('next/dynamic', () => ({
  __esModule: true,
  default: () => {
    const Stub = () => (
      <div data-testid="map-stub">{JSON.stringify(useMapSelection())}</div>
    );
    Stub.displayName = 'DynamicMap';
    return Stub;
  },
}));

// Mock child components
vi.mock('@/components/PwaInstallPrompt', () => ({
  PwaInstallPrompt: () => <div data-testid="pwa-stub" />,
}));
vi.mock('@/components/WelcomeModal', () => ({
  WelcomeModal: () => <div data-testid="welcome-stub" />,
}));

// Trails now arrive as a prop from the server component, which reads them
// from Payload. Passing them in here exercises the real prop -> trail-source
// -> consumer path rather than mocking the store.
const TRAILS: MountainBikeTrail[] = [
  {
    slug: 'mouse-creek',
    trailName: 'Mouse Creek Greenway Phase 1',
    displayName: 'Mouse Creek Greenway Phase 1',
    recArea: 'Cleveland',
    rating: '',
    color: '#059669',
    distance: 0.6,
    elevationGain: 15,
    elevationLoss: 14,
    elevationMin: 790,
    elevationMax: 804,
    defaultBounds: [-84.876938, 35.175211, -84.87299, 35.182087],
    icon: faMountain,
  },
];

const ROUTES: BikeRoute[] = [
  {
    id: 'zoo-loop-v2-full-public',
    name: 'Zoo Loop',
    color: '#F97316',
    description: 'Zoo route',
    icon: faRoute,
    defaultWidth: 8,
    opacity: 1,
    distance: 5.4,
  },
];

vi.mock('@/data/geo_data', () => ({
  bikeRoutes: [
    {
      id: 'zoo-loop-v2-full-public',
      name: 'Zoo Loop',
      color: '#F97316',
      description: 'Zoo route',
      defaultWidth: 8,
      opacity: 1.0,
      defaultBounds: [-85.307614, 35.037548, -85.281097, 35.061733],
    },
  ],
}));

// Imported after the mocks are set up.
import HomeClient from './HomeClient';

const CONTENT = {
  cityId: activeCityId,
  routes: ROUTES,
  trails: TRAILS,
  attractions: [],
};

describe('HomeClient — share link URL parameter handling', () => {
  afterEach(() => {
    cleanup();
    window.history.replaceState(null, '', '/');
    delete (window as unknown as Record<string, boolean>).__mapReady;
  });

  function mapReady() {
    act(() => {
      window.dispatchEvent(new Event(MAP_EVENTS.MAP_READY));
    });
  }

  function selection() {
    return JSON.parse(screen.getByTestId('map-stub').textContent ?? 'null');
  }

  it.each([
    [
      '/?trail=mouse-creek',
      { kind: 'trail', trailName: 'Mouse Creek Greenway Phase 1' },
    ],
    ['/?route=zoo-loop', { kind: 'route', routeId: 'zoo-loop-v2-full-public' }],
    [
      '/?trail=mouse-creek&route=zoo-loop',
      { kind: 'trail', trailName: 'Mouse Creek Greenway Phase 1' },
    ],
    ['/', null],
    ['/?trail=nonexistent-trail', null],
  ])('resolves %s when the map is ready', (url, expected) => {
    window.history.replaceState(null, '', url);
    render(<HomeClient content={CONTENT} />);
    expect(selection()).toBeNull();
    mapReady();
    expect(selection()).toEqual(expected);
  });

  it('selects immediately if the map was already ready', () => {
    (window as unknown as Record<string, boolean>).__mapReady = true;
    window.history.replaceState(null, '', '/?trail=mouse-creek');
    render(<HomeClient content={CONTENT} />);
    expect(selection()).toEqual({
      kind: 'trail',
      trailName: 'Mouse Creek Greenway Phase 1',
    });
  });
});

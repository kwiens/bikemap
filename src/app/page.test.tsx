import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { MAP_EVENTS } from '@/events';

// Mock next/dynamic to render a simple placeholder instead of the real Map
vi.mock('next/dynamic', () => ({
  __esModule: true,
  default: () => {
    const Stub = () => <div data-testid="map-stub" />;
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

// Mock geo data with known trails and routes
vi.mock('@/data/geo_data', () => ({
  mountainBikeTrails: [
    {
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
    },
  ],
  bikeRoutes: [
    {
      id: 'zoo-loop-v2-full-public',
      name: 'Zoo Loop',
      color: '#DC2626',
      description: 'Zoo route',
      defaultWidth: 8,
      opacity: 1.0,
      defaultBounds: [-85.307614, 35.037548, -85.281097, 35.061733],
    },
  ],
}));

// Import Home after mocks are set up
import Home from './page';

describe('Home — share link URL parameter handling', () => {
  let dispatchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    dispatchSpy = vi.spyOn(window, 'dispatchEvent');
  });

  afterEach(() => {
    cleanup();
    dispatchSpy.mockRestore();
    // Reset URL
    window.history.replaceState(null, '', '/');
  });

  it('dispatches TRAIL_SELECT on MAP_READY when ?trail= matches', () => {
    window.history.replaceState(
      null,
      '',
      '/?trail=mouse-creek-greenway-phase-1',
    );
    render(<Home />);

    // Before MAP_READY fires, no TRAIL_SELECT should have been dispatched
    const trailEvents = dispatchSpy.mock.calls.filter(
      ([e]) => (e as Event).type === MAP_EVENTS.TRAIL_SELECT,
    );
    expect(trailEvents).toHaveLength(0);

    // Simulate map ready
    window.dispatchEvent(new Event(MAP_EVENTS.MAP_READY));

    const afterReady = dispatchSpy.mock.calls.filter(
      ([e]) => (e as Event).type === MAP_EVENTS.TRAIL_SELECT,
    );
    expect(afterReady).toHaveLength(1);

    const detail = (afterReady[0][0] as CustomEvent).detail;
    expect(detail.trailName).toBe('Mouse Creek Greenway Phase 1');
  });

  it('dispatches ROUTE_SELECT on MAP_READY when ?route= matches', () => {
    window.history.replaceState(null, '', '/?route=zoo-loop');
    render(<Home />);

    // Simulate map ready
    window.dispatchEvent(new Event(MAP_EVENTS.MAP_READY));

    const routeEvents = dispatchSpy.mock.calls.filter(
      ([e]) => (e as Event).type === MAP_EVENTS.ROUTE_SELECT,
    );
    expect(routeEvents).toHaveLength(1);
    expect((routeEvents[0][0] as CustomEvent).detail.routeId).toBe(
      'zoo-loop-v2-full-public',
    );
  });

  it('does not dispatch anything when URL has no trail or route param', () => {
    window.history.replaceState(null, '', '/');
    render(<Home />);

    window.dispatchEvent(new Event(MAP_EVENTS.MAP_READY));

    const selectEvents = dispatchSpy.mock.calls.filter(
      ([e]) =>
        (e as Event).type === MAP_EVENTS.TRAIL_SELECT ||
        (e as Event).type === MAP_EVENTS.ROUTE_SELECT,
    );
    expect(selectEvents).toHaveLength(0);
  });

  it('does not dispatch when trail slug does not match any trail', () => {
    window.history.replaceState(null, '', '/?trail=nonexistent-trail');
    render(<Home />);

    window.dispatchEvent(new Event(MAP_EVENTS.MAP_READY));

    const trailEvents = dispatchSpy.mock.calls.filter(
      ([e]) => (e as Event).type === MAP_EVENTS.TRAIL_SELECT,
    );
    expect(trailEvents).toHaveLength(0);
  });

  it('only fires once even if MAP_READY is dispatched multiple times', () => {
    window.history.replaceState(
      null,
      '',
      '/?trail=mouse-creek-greenway-phase-1',
    );
    render(<Home />);

    window.dispatchEvent(new Event(MAP_EVENTS.MAP_READY));
    window.dispatchEvent(new Event(MAP_EVENTS.MAP_READY));

    const trailEvents = dispatchSpy.mock.calls.filter(
      ([e]) => (e as Event).type === MAP_EVENTS.TRAIL_SELECT,
    );
    expect(trailEvents).toHaveLength(1);
  });

  it('prefers trail param when both trail and route are present', () => {
    window.history.replaceState(
      null,
      '',
      '/?trail=mouse-creek-greenway-phase-1&route=zoo-loop',
    );
    render(<Home />);

    window.dispatchEvent(new Event(MAP_EVENTS.MAP_READY));

    const trailEvents = dispatchSpy.mock.calls.filter(
      ([e]) => (e as Event).type === MAP_EVENTS.TRAIL_SELECT,
    );
    const routeEvents = dispatchSpy.mock.calls.filter(
      ([e]) => (e as Event).type === MAP_EVENTS.ROUTE_SELECT,
    );
    expect(trailEvents).toHaveLength(1);
    expect(routeEvents).toHaveLength(0);
  });
});

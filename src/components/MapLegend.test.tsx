import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MapLegendProvider } from './MapLegend';
import { MAP_EVENTS } from '@/events';
import { dispatch } from '@/test/fixtures';

// Mock all sidebar children to keep tests focused on MapLegendProvider state
vi.mock('./sidebar', () => ({
  BikeRoutes: ({
    selectedRoute,
    onRouteSelect,
  }: {
    selectedRoute: string | null;
    onRouteSelect: (id: string) => void;
  }) => (
    <div data-testid="bike-routes" data-selected-route={selectedRoute ?? ''}>
      <button type="button" onClick={() => onRouteSelect('route-1')}>
        Select Route
      </button>
    </div>
  ),
  MountainBikeTrails: ({
    selectedTrail,
    onTrailSelect,
    onAreaSelect,
  }: {
    selectedTrail: string | null;
    onTrailSelect: (name: string) => void;
    onAreaSelect: (name: string) => void;
  }) => (
    <div
      data-testid="mountain-bike-trails"
      data-selected-trail={selectedTrail ?? ''}
    >
      <button type="button" onClick={() => onTrailSelect('Trail A')}>
        Select Trail
      </button>
      <button type="button" onClick={() => onAreaSelect('Raccoon Mountain')}>
        Select Area
      </button>
    </div>
  ),
  MapLayers: () => <div data-testid="map-layers" />,
  AttractionsList: () => <div data-testid="attractions" />,
  BikeResourcesList: () => <div data-testid="bike-resources" />,
  BikeRentalList: () => <div data-testid="bike-rentals" />,
  InformationSection: () => <div data-testid="info" />,
  Footer: () => <div data-testid="footer" />,
}));

vi.mock('./styles', () => ({
  TOGGLE_BTN_CLASS: 'toggle-btn',
  TOGGLE_ICON_CLASS: 'toggle-icon',
}));

let mockRideStyle: string | null = null;
vi.mock('./WelcomeModal', () => ({
  getRideStyle: () => mockRideStyle,
}));

describe('MapLegendProvider', () => {
  const events: Array<{ type: string; detail: unknown }> = [];
  let handler: (e: Event) => void;

  beforeEach(() => {
    mockRideStyle = null;
    events.length = 0;
    handler = (e: Event) => {
      events.push({ type: e.type, detail: (e as CustomEvent).detail });
    };
    // Listen for dispatched events
    for (const key of Object.values(MAP_EVENTS)) {
      window.addEventListener(key, handler);
    }
  });

  afterEach(() => {
    for (const key of Object.values(MAP_EVENTS)) {
      window.removeEventListener(key, handler);
    }
  });

  it('defaults to routes section when no cookie', () => {
    render(
      <MapLegendProvider>
        <div />
      </MapLegendProvider>,
    );
    expect(screen.getByTestId('bike-routes')).toBeInTheDocument();
    expect(
      screen.queryByTestId('mountain-bike-trails'),
    ).not.toBeInTheDocument();
  });

  it('defaults to trails section when cookie is mountain', () => {
    mockRideStyle = 'mountain';
    render(
      <MapLegendProvider>
        <div />
      </MapLegendProvider>,
    );
    expect(screen.getByTestId('mountain-bike-trails')).toBeInTheDocument();
    expect(screen.queryByTestId('bike-routes')).not.toBeInTheDocument();
  });

  it('RIDE_STYLE_CHOSEN event switches to trails', () => {
    render(
      <MapLegendProvider>
        <div />
      </MapLegendProvider>,
    );
    expect(screen.getByTestId('bike-routes')).toBeInTheDocument();

    dispatch(MAP_EVENTS.RIDE_STYLE_CHOSEN, { style: 'mountain' });

    expect(screen.getByTestId('mountain-bike-trails')).toBeInTheDocument();
    expect(screen.queryByTestId('bike-routes')).not.toBeInTheDocument();
  });

  it('ROUTE_SELECT event sets selectedRoute and clears selectedTrail', () => {
    mockRideStyle = 'mountain';
    render(
      <MapLegendProvider>
        <div />
      </MapLegendProvider>,
    );

    // First select a trail
    dispatch(MAP_EVENTS.TRAIL_SELECT, { trailName: 'Trail A' });
    expect(screen.getByTestId('mountain-bike-trails')).toHaveAttribute(
      'data-selected-trail',
      'Trail A',
    );

    // Now select a route — should clear trail
    dispatch(MAP_EVENTS.ROUTE_SELECT, { routeId: 'route-1' });
    expect(screen.getByTestId('mountain-bike-trails')).toHaveAttribute(
      'data-selected-trail',
      '',
    );
  });

  it('TRAIL_SELECT event sets selectedTrail and switches to trails section', () => {
    render(
      <MapLegendProvider>
        <div />
      </MapLegendProvider>,
    );

    dispatch(MAP_EVENTS.TRAIL_SELECT, { trailName: 'Trail A' });

    expect(screen.getByTestId('mountain-bike-trails')).toBeInTheDocument();
    expect(screen.getByTestId('mountain-bike-trails')).toHaveAttribute(
      'data-selected-trail',
      'Trail A',
    );
  });

  it('ROUTE_DESELECT clears selectedRoute', () => {
    render(
      <MapLegendProvider>
        <div />
      </MapLegendProvider>,
    );

    dispatch(MAP_EVENTS.ROUTE_SELECT, { routeId: 'route-1' });
    expect(screen.getByTestId('bike-routes')).toHaveAttribute(
      'data-selected-route',
      'route-1',
    );

    dispatch(MAP_EVENTS.ROUTE_DESELECT);
    expect(screen.getByTestId('bike-routes')).toHaveAttribute(
      'data-selected-route',
      '',
    );
  });

  it('TRAIL_DESELECT clears selectedTrail', () => {
    mockRideStyle = 'mountain';
    render(
      <MapLegendProvider>
        <div />
      </MapLegendProvider>,
    );

    dispatch(MAP_EVENTS.TRAIL_SELECT, { trailName: 'Trail A' });
    dispatch(MAP_EVENTS.TRAIL_DESELECT);
    expect(screen.getByTestId('mountain-bike-trails')).toHaveAttribute(
      'data-selected-trail',
      '',
    );
  });

  it('area select dispatches deselect events before area-select', () => {
    mockRideStyle = 'mountain';
    render(
      <MapLegendProvider>
        <div />
      </MapLegendProvider>,
    );

    fireEvent.click(screen.getByText('Select Area'));

    const eventTypes = events.map((e) => e.type);
    const deselectIdx = eventTypes.indexOf(MAP_EVENTS.ROUTE_DESELECT);
    const trailDeselectIdx = eventTypes.indexOf(MAP_EVENTS.TRAIL_DESELECT);
    const areaSelectIdx = eventTypes.indexOf(MAP_EVENTS.AREA_SELECT);

    expect(deselectIdx).toBeLessThan(areaSelectIdx);
    expect(trailDeselectIdx).toBeLessThan(areaSelectIdx);
  });

  it('renders map layers in routes section', () => {
    render(
      <MapLegendProvider>
        <div />
      </MapLegendProvider>,
    );

    expect(screen.getByTestId('map-layers')).toBeInTheDocument();
  });

  it('hides map layers when switched to trails section', () => {
    render(
      <MapLegendProvider>
        <div />
      </MapLegendProvider>,
    );

    dispatch(MAP_EVENTS.RIDE_STYLE_CHOSEN, { style: 'mountain' });

    expect(screen.queryByTestId('map-layers')).not.toBeInTheDocument();
  });
});

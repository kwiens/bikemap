/** @vitest-environment jsdom */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  render as renderReact,
  screen,
  fireEvent,
} from '@testing-library/react';
import type { MapFeature } from '@/data/map-features';
import { MapLegendProvider } from './MapLegend';
import { EmbedProvider } from './EmbedContext';
import { DEFAULT_EMBED_OPTIONS, type EmbedOptions } from '@/utils/embed';
import { siteConfig } from '@/config/site.config';
import { MAP_EVENTS } from '@/events';
import { mapSelectionHarness } from '@/test/map-selection';
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
  MapLayersSection: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="map-layers-section">{children}</div>
  ),
  ToggleRow: ({
    label,
    isActive,
    onToggle,
  }: {
    label: string;
    isActive: boolean;
    onToggle: () => void;
  }) => (
    <button type="button" onClick={onToggle} data-active={isActive}>
      {label}
    </button>
  ),
  AttractionsList: () => <div data-testid="attractions" />,
  BikeResourcesList: () => <div data-testid="bike-resources" />,
  BikeRentalList: () => <div data-testid="bike-rentals" />,
  InformationSection: () => <div data-testid="info" />,
  BikeNetworkLayer: ({
    isActive,
    onToggle,
  }: {
    isActive: boolean;
    onToggle: () => void;
  }) => (
    <button
      type="button"
      onClick={onToggle}
      data-testid="bike-network"
      data-active={isActive}
    >
      Bike Network
    </button>
  ),
}));

vi.mock('./styles', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./styles')>()),
  TOGGLE_BTN_CLASS: 'toggle-btn',
  TOGGLE_ICON_CLASS: 'toggle-icon',
}));

let mockRideStyle: string | null = null;
vi.mock('./WelcomeModal', () => ({
  getRideStyle: () => mockRideStyle,
}));

const selection = mapSelectionHarness();

function render(ui: React.ReactElement) {
  return renderReact(ui, { wrapper: selection.Wrapper });
}

describe('MapLegendProvider', () => {
  const events: Array<{ type: string; detail: unknown }> = [];
  let handler: (e: Event) => void;

  beforeEach(() => {
    mockRideStyle = null;
    // Clear cookies so activeTab doesn't leak between tests
    document.cookie.split(';').forEach((c) => {
      const name = c.split('=')[0].trim();
      document.cookie = `${name}=; max-age=0; path=/`;
    });
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
      <MapLegendProvider attractions={[]}>
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
      <MapLegendProvider attractions={[]}>
        <div />
      </MapLegendProvider>,
    );
    expect(screen.getByTestId('mountain-bike-trails')).toBeInTheDocument();
    expect(screen.queryByTestId('bike-routes')).not.toBeInTheDocument();
  });

  it('RIDE_STYLE_CHOSEN event switches to trails', () => {
    render(
      <MapLegendProvider attractions={[]}>
        <div />
      </MapLegendProvider>,
    );
    expect(screen.getByTestId('bike-routes')).toBeInTheDocument();

    dispatch(MAP_EVENTS.RIDE_STYLE_CHOSEN, { style: 'mountain' });

    expect(screen.getByTestId('mountain-bike-trails')).toBeInTheDocument();
    expect(screen.queryByTestId('bike-routes')).not.toBeInTheDocument();
  });

  it('a route replaces the trail and switches to Casual', () => {
    mockRideStyle = 'mountain';
    render(
      <MapLegendProvider attractions={[]}>
        <div />
      </MapLegendProvider>,
    );

    // First select a trail
    selection.select({ kind: 'trail', trailName: 'Trail A' });
    expect(screen.getByTestId('mountain-bike-trails')).toHaveAttribute(
      'data-selected-trail',
      'Trail A',
    );

    // Now select a route — should clear trail
    selection.select({ kind: 'route', routeId: 'route-1' });
    expect(screen.getByTestId('bike-routes')).toHaveAttribute(
      'data-selected-route',
      'route-1',
    );
    fireEvent.click(screen.getByRole('button', { name: 'MTB' }));
    expect(screen.getByTestId('mountain-bike-trails')).toHaveAttribute(
      'data-selected-trail',
      '',
    );
  });

  it('a trail selection switches to the trails section', () => {
    render(
      <MapLegendProvider attractions={[]}>
        <div />
      </MapLegendProvider>,
    );

    selection.select({ kind: 'trail', trailName: 'Trail A' });

    expect(screen.getByTestId('mountain-bike-trails')).toBeInTheDocument();
    expect(screen.getByTestId('mountain-bike-trails')).toHaveAttribute(
      'data-selected-trail',
      'Trail A',
    );
  });

  it('clearing selection clears the route card', () => {
    render(
      <MapLegendProvider attractions={[]}>
        <div />
      </MapLegendProvider>,
    );

    selection.select({ kind: 'route', routeId: 'route-1' });
    expect(screen.getByTestId('bike-routes')).toHaveAttribute(
      'data-selected-route',
      'route-1',
    );

    selection.select(null);
    expect(screen.getByTestId('bike-routes')).toHaveAttribute(
      'data-selected-route',
      '',
    );
  });

  it('clearing selection clears the trail card', () => {
    mockRideStyle = 'mountain';
    render(
      <MapLegendProvider attractions={[]}>
        <div />
      </MapLegendProvider>,
    );

    selection.select({ kind: 'trail', trailName: 'Trail A' });
    selection.select(null);
    expect(screen.getByTestId('mountain-bike-trails')).toHaveAttribute(
      'data-selected-trail',
      '',
    );
  });

  it('clicking empty map area clears both route and trail selection', () => {
    render(
      <MapLegendProvider attractions={[]}>
        <div />
      </MapLegendProvider>,
    );

    // Select a route
    selection.select({ kind: 'route', routeId: 'route-1' });
    expect(screen.getByTestId('bike-routes')).toHaveAttribute(
      'data-selected-route',
      'route-1',
    );

    selection.select(null);

    expect(screen.getByTestId('bike-routes')).toHaveAttribute(
      'data-selected-route',
      '',
    );
  });

  it('selects a route from the sidebar', () => {
    render(
      <MapLegendProvider attractions={[]}>
        <div />
      </MapLegendProvider>,
    );
    fireEvent.click(screen.getByText('Select Route'));
    expect(selection.get()).toEqual({ kind: 'route', routeId: 'route-1' });
  });

  it('selects a trail from the sidebar', () => {
    mockRideStyle = 'mountain';
    render(
      <MapLegendProvider attractions={[]}>
        <div />
      </MapLegendProvider>,
    );
    fireEvent.click(screen.getByText('Select Trail'));
    expect(selection.get()).toEqual({ kind: 'trail', trailName: 'Trail A' });
  });

  it('exposes the sidebar state to assistive technology', () => {
    render(
      <MapLegendProvider attractions={[]}>
        <div />
      </MapLegendProvider>,
    );
    const toggle = screen.getByRole('button', { name: 'Close map menu' });
    const sidebar = document.getElementById(
      toggle.getAttribute('aria-controls') ?? '',
    );
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(toggle);
    expect(toggle).toHaveAccessibleName('Open map menu');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(sidebar).toHaveAttribute('inert');
  });

  it('an area replaces the previously selected trail', () => {
    mockRideStyle = 'mountain';
    render(
      <MapLegendProvider attractions={[]}>
        <div />
      </MapLegendProvider>,
    );

    fireEvent.click(screen.getByText('Select Trail'));
    fireEvent.click(screen.getByText('Select Area'));
    expect(selection.get()).toEqual({
      kind: 'area',
      areaName: 'Raccoon Mountain',
    });
    expect(screen.getByTestId('mountain-bike-trails')).toHaveAttribute(
      'data-selected-trail',
      '',
    );
  });

  it('renders map layers in routes section', () => {
    render(
      <MapLegendProvider attractions={[]}>
        <div />
      </MapLegendProvider>,
    );

    expect(screen.getByTestId('map-layers')).toBeInTheDocument();
  });

  it('hides map layers when switched to trails section', () => {
    render(
      <MapLegendProvider attractions={[]}>
        <div />
      </MapLegendProvider>,
    );

    dispatch(MAP_EVENTS.RIDE_STYLE_CHOSEN, { style: 'mountain' });

    expect(screen.queryByTestId('map-layers')).not.toBeInTheDocument();
  });

  it('Nationwide trails toggle lives in the trails tab and dispatches osmTrails', () => {
    render(
      <MapLegendProvider attractions={[]}>
        <div />
      </MapLegendProvider>,
    );

    // Not present in the casual (routes) tab
    expect(screen.queryByText('Nationwide trails')).not.toBeInTheDocument();

    dispatch(MAP_EVENTS.RIDE_STYLE_CHOSEN, { style: 'mountain' });

    fireEvent.click(screen.getByText('Nationwide trails'));

    const toggle = events.find(
      (e) =>
        e.type === MAP_EVENTS.LAYER_TOGGLE &&
        (e.detail as { layer?: string }).layer === 'osmTrails',
    );
    expect(toggle).toBeDefined();
    expect((toggle?.detail as { visible: boolean }).visible).toBe(true);
  });
});

describe('embed mode', () => {
  const events: Array<{ type: string; detail: unknown }> = [];
  let handler: (e: Event) => void;

  function renderEmbed(
    options: Partial<EmbedOptions> = {},
    attractions: MapFeature[] = [],
  ) {
    const merged: EmbedOptions = { ...DEFAULT_EMBED_OPTIONS, ...options };
    return render(
      <EmbedProvider options={merged}>
        <MapLegendProvider attractions={attractions}>
          <div />
        </MapLegendProvider>
      </EmbedProvider>,
    );
  }

  beforeEach(() => {
    mockRideStyle = null;
    // Clear cookies so no setting leaks in (and so we can assert none appear)
    document.cookie.split(';').forEach((c) => {
      const name = c.split('=')[0].trim();
      document.cookie = `${name}=; max-age=0; path=/`;
    });
    delete (window as unknown as { __mapReady?: boolean }).__mapReady;
    events.length = 0;
    handler = (e: Event) => {
      events.push({ type: e.type, detail: (e as CustomEvent).detail });
    };
    for (const key of Object.values(MAP_EVENTS)) {
      window.addEventListener(key, handler);
    }
  });

  afterEach(() => {
    for (const key of Object.values(MAP_EVENTS)) {
      window.removeEventListener(key, handler);
    }
    delete (window as unknown as { __mapReady?: boolean }).__mapReady;
  });

  it('renders the Casual section without route-family tabs', () => {
    const { container } = renderEmbed();

    expect(
      screen.queryByRole('button', { name: 'MTB' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Casual' }),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('bike-routes')).toBeInTheDocument();
    expect(
      screen.queryByTestId('mountain-bike-trails'),
    ).not.toBeInTheDocument();
    // No Information section in embed mode
    expect(screen.queryByTestId('info')).not.toBeInTheDocument();
    // Compact header label instead of the pill
    expect(container.textContent).toContain(
      `${siteConfig.name} · Casual routes`,
    );
  });

  it('renders the MTB section selected by the host page', () => {
    const { container } = renderEmbed({ mode: 'mtb' });

    expect(screen.getByTestId('mountain-bike-trails')).toBeInTheDocument();
    expect(screen.queryByTestId('bike-routes')).not.toBeInTheDocument();
    expect(screen.getByText('Nationwide trails')).toBeInTheDocument();
    expect(container.textContent).toContain(`${siteConfig.name} · MTB routes`);
  });

  it('sidebar starts closed (-translate-x-full) when sidebarOpen is false', () => {
    const { container } = renderEmbed({ sidebarOpen: false });
    expect(
      container.querySelector('[class*="-translate-x-full"]'),
    ).not.toBeNull();
    expect(container.querySelector('[class*="translate-x-0"]')).toBeNull();
  });

  it('sidebar starts open (translate-x-0) when sidebarOpen is true', () => {
    const { container } = renderEmbed({ sidebarOpen: true });
    expect(container.querySelector('[class*="translate-x-0"]')).not.toBeNull();
  });

  it('does not write the settings cookie when the sidebar is toggled', () => {
    const { container } = renderEmbed({ sidebarOpen: false });
    const toggleBtn = container.querySelector(
      '.toggle-btn',
    ) as HTMLButtonElement;
    expect(toggleBtn).toBeTruthy();

    fireEvent.click(toggleBtn);
    fireEvent.click(toggleBtn);

    expect(document.cookie).not.toContain('-settings=');
  });

  it('dispatches LAYER_TOGGLE for preset layers on mount when the map is ready', () => {
    (window as unknown as { __mapReady?: boolean }).__mapReady = true;

    renderEmbed({ layers: ['attractions'] }, [
      {
        id: 1,
        name: 'Traffic garden',
        description: 'Practice cycling.',
        address: 'Chattanooga, TN',
        latitude: 35,
        longitude: -85,
        icon: 'bicycle',
      },
    ]);

    const toggleEvents = events.filter(
      (e) => e.type === MAP_EVENTS.LAYER_TOGGLE,
    );
    expect(toggleEvents).toContainEqual({
      type: MAP_EVENTS.LAYER_TOGGLE,
      detail: { layer: 'attractions', visible: true },
    });
  });

  it('skips the Attractions preset when there are no published attractions', () => {
    (window as unknown as { __mapReady?: boolean }).__mapReady = true;

    renderEmbed({ layers: ['attractions'] });

    expect(events.some((e) => e.type === MAP_EVENTS.LAYER_TOGGLE)).toBe(false);
  });

  it('waits for MAP_READY before dispatching preset layers when the map is not ready yet', () => {
    renderEmbed({ layers: ['bikeResources'] });

    expect(events.some((e) => e.type === MAP_EVENTS.LAYER_TOGGLE)).toBe(false);

    dispatch(MAP_EVENTS.MAP_READY);

    const toggleEvents = events.filter(
      (e) => e.type === MAP_EVENTS.LAYER_TOGGLE,
    );
    expect(toggleEvents).toContainEqual({
      type: MAP_EVENTS.LAYER_TOGGLE,
      detail: { layer: 'bikeResources', visible: true },
    });
  });
});

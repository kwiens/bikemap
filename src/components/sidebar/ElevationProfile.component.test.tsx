import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import { ElevationProfile } from './ElevationProfile';
import { MAP_EVENTS } from '@/events';
import type { ElevationProfile as ElevationProfileData } from '@/data/geo_data';

// Mock ride-storage and ride-stats (used for ride-select)
vi.mock('@/utils/ride-storage', () => ({
  loadRide: vi.fn().mockResolvedValue(null),
}));
vi.mock('@/utils/ride-stats', () => ({
  rideToElevationProfile: vi.fn().mockReturnValue(null),
}));

const mockProfile: ElevationProfileData = {
  trail: 'Test Trail',
  distance: 1000,
  gain: 100,
  loss: 50,
  min: 800,
  max: 900,
  profile: [
    [0, 800, -85.3, 35.0],
    [250, 830, -85.301, 35.001],
    [500, 870, -85.302, 35.002],
    [750, 890, -85.303, 35.003],
    [1000, 900, -85.304, 35.004],
  ],
};

describe('ElevationProfile component', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockProfile,
    });
    global.ResizeObserver = class {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    } as unknown as typeof ResizeObserver;
    global.URL.createObjectURL = vi.fn().mockReturnValue('blob:test');
    global.URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders nothing initially (no trail selected)', () => {
    const { container } = render(<ElevationProfile />);
    expect(container.innerHTML).toBe('');
  });

  it('loads and shows profile on trail-select event', async () => {
    render(<ElevationProfile />);

    act(() => {
      window.dispatchEvent(
        new CustomEvent(MAP_EVENTS.TRAIL_SELECT, {
          detail: { trailName: 'Test Trail' },
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByText('Test Trail')).toBeInTheDocument();
    });

    expect(global.fetch).toHaveBeenCalledWith(
      '/data/elevation/test-trail.json',
      expect.anything(),
    );
  });

  it('clears profile on trail-deselect when source was trail', async () => {
    render(<ElevationProfile />);

    // Select trail
    act(() => {
      window.dispatchEvent(
        new CustomEvent(MAP_EVENTS.TRAIL_SELECT, {
          detail: { trailName: 'Test Trail' },
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByText('Test Trail')).toBeInTheDocument();
    });

    // Deselect
    act(() => {
      window.dispatchEvent(new CustomEvent(MAP_EVENTS.TRAIL_DESELECT));
    });

    await waitFor(() => {
      expect(screen.queryByText('Test Trail')).not.toBeInTheDocument();
    });
  });

  it('trail-sourced profile survives route-select event', async () => {
    render(<ElevationProfile />);

    act(() => {
      window.dispatchEvent(
        new CustomEvent(MAP_EVENTS.TRAIL_SELECT, {
          detail: { trailName: 'Test Trail' },
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByText('Test Trail')).toBeInTheDocument();
    });

    // Route-select should NOT clear trail-sourced profile
    act(() => {
      window.dispatchEvent(
        new CustomEvent(MAP_EVENTS.ROUTE_SELECT, {
          detail: { routeId: 'some-route' },
        }),
      );
    });

    expect(screen.getByText('Test Trail')).toBeInTheDocument();
  });

  it('trail-sourced profile survives route-deselect event', async () => {
    render(<ElevationProfile />);

    act(() => {
      window.dispatchEvent(
        new CustomEvent(MAP_EVENTS.TRAIL_SELECT, {
          detail: { trailName: 'Test Trail' },
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByText('Test Trail')).toBeInTheDocument();
    });

    // route-deselect should NOT clear trail-sourced profile
    act(() => {
      window.dispatchEvent(new CustomEvent(MAP_EVENTS.ROUTE_DESELECT));
    });

    expect(screen.getByText('Test Trail')).toBeInTheDocument();
  });

  it('location-update is ignored when no profile loaded', () => {
    const { container } = render(<ElevationProfile />);

    act(() => {
      window.dispatchEvent(
        new CustomEvent(MAP_EVENTS.LOCATION_UPDATE, {
          detail: { lng: -85.302, lat: 35.002 },
        }),
      );
    });

    expect(container.innerHTML).toBe('');
  });

  it('recording-stop clears ride-sourced state and allows new trail selection', async () => {
    render(<ElevationProfile />);

    // Start recording
    act(() => {
      window.dispatchEvent(new CustomEvent(MAP_EVENTS.RIDE_RECORDING_START));
    });

    // Stop recording — should clear source
    act(() => {
      window.dispatchEvent(new CustomEvent(MAP_EVENTS.RIDE_RECORDING_STOP));
    });

    // Now select a trail — should work because sourceRef was cleared
    act(() => {
      window.dispatchEvent(
        new CustomEvent(MAP_EVENTS.TRAIL_SELECT, {
          detail: { trailName: 'After Recording Trail' },
        }),
      );
    });

    // The profile fetch should use the new trail name (slugified)
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/data/elevation/after-recording-trail.json',
        expect.anything(),
      );
    });
  });
});

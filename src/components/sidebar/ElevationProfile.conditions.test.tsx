import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TrailConditionsProvider } from '@/components/TrailConditionsProvider';
import { MAP_EVENTS } from '@/events';
import { ElevationProfile } from './ElevationProfile';

vi.mock('@/data/trail-source', () => ({
  getMountainBikeTrails: () => [
    { trailName: 'Unmeasured Trail', slug: 'unmeasured' },
  ],
}));

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.startsWith('/api/map/conditions?')) {
        return {
          ok: true,
          json: async () => ({
            latest: {},
            locked: {},
            options: [
              {
                value: 'dry',
                name: 'Dry',
                color: '#16a34a',
                marksClosed: false,
              },
            ],
            reporting: { enabled: true, message: '' },
          }),
        };
      }
      return { ok: false, status: 404 };
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ElevationProfile conditions without a chart', () => {
  it('offers reporting after both elevation lookups miss and clears it for an OSM selection', async () => {
    render(
      <TrailConditionsProvider>
        <ElevationProfile />
      </TrailConditionsProvider>,
    );
    act(() => {
      window.dispatchEvent(
        new CustomEvent(MAP_EVENTS.TRAIL_SELECT, {
          detail: { trailName: 'Unmeasured Trail' },
        }),
      );
    });

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        '/data/elevation/chattanooga/unmeasured.json',
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
      expect(
        screen.getByRole('button', { name: 'Report' }),
      ).toBeInTheDocument();
    });
    expect(
      screen.queryByRole('img', { name: /Elevation profile/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByTitle('Download GPX')).not.toBeInTheDocument();

    const reportOpened = vi.fn();
    window.addEventListener(MAP_EVENTS.CONDITION_REPORT_OPEN, reportOpened, {
      once: true,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Report' }));
    expect(reportOpened).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: { slug: 'unmeasured', trailName: 'Unmeasured Trail' },
      }),
    );

    act(() => {
      window.dispatchEvent(
        new CustomEvent(MAP_EVENTS.OSM_TRAIL_SELECT, {
          detail: {
            profile: {
              trail: 'Unmeasured Trail',
              distance: 100,
              gain: 10,
              loss: 0,
              min: 100,
              max: 110,
              profile: [
                [0, 100, -85, 35],
                [100, 110, -85.01, 35.01],
              ],
            },
          },
        }),
      );
    });
    expect(
      screen.getByRole('img', { name: /Elevation profile/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Report' }),
    ).not.toBeInTheDocument();
  });
});

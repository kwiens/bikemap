/** @vitest-environment jsdom */

import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAP_EVENTS } from '@/events';
import { useUrlDeepLink } from './useUrlDeepLink';

vi.mock('@/data/route-source', () => ({
  getBikeRoutes: () => [{ id: 'riverwalk-layer', name: 'Riverwalk' }],
}));

vi.mock('@/data/trail-source', () => ({
  getMountainBikeTrails: () => [
    { trailName: 'Cherokee Trail', slug: 'cherokee-trail' },
  ],
}));

vi.mock('@/utils/map-ready', () => ({
  onMapReady: (callback: () => void) => {
    callback();
    return () => {};
  },
}));

describe('useUrlDeepLink', () => {
  const selections: Array<{ type: string; detail: unknown }> = [];
  function record(e: Event) {
    selections.push({ type: e.type, detail: (e as CustomEvent).detail });
  }

  beforeEach(() => {
    selections.length = 0;
    window.addEventListener(MAP_EVENTS.TRAIL_SELECT, record);
    window.addEventListener(MAP_EVENTS.ROUTE_SELECT, record);
  });

  afterEach(() => {
    window.removeEventListener(MAP_EVENTS.TRAIL_SELECT, record);
    window.removeEventListener(MAP_EVENTS.ROUTE_SELECT, record);
    window.history.replaceState(null, '', '/');
  });

  it('selects a trail from the query string by default', () => {
    window.history.replaceState(null, '', '/?trail=cherokee-trail');

    renderHook(() => useUrlDeepLink());

    expect(selections).toEqual([
      {
        type: MAP_EVENTS.TRAIL_SELECT,
        detail: { trailName: 'Cherokee Trail' },
      },
    ]);
  });

  it('ignores a trail in a Casual embed and selects the decoded route', () => {
    window.history.replaceState(
      null,
      '',
      '/embed?trail=cherokee-trail&route=riverwalk',
    );

    renderHook(() =>
      useUrlDeepLink({ trails: false, routes: true, route: 'riverwalk' }),
    );

    expect(selections).toEqual([
      {
        type: MAP_EVENTS.ROUTE_SELECT,
        detail: { routeId: 'riverwalk-layer' },
      },
    ]);
  });

  it('ignores a route in an MTB embed', () => {
    window.history.replaceState(null, '', '/embed?mode=mtb&route=riverwalk');

    renderHook(() =>
      useUrlDeepLink({ trails: true, routes: false, route: 'riverwalk' }),
    );

    expect(selections).toEqual([]);
  });

  it('prefers the pre-decoded trail over the raw query value', () => {
    window.history.replaceState(null, '', '/embed?mode=mtb&trail=%20');

    renderHook(() =>
      useUrlDeepLink({
        trails: true,
        routes: false,
        trail: 'cherokee-trail',
      }),
    );

    expect(selections).toEqual([
      {
        type: MAP_EVENTS.TRAIL_SELECT,
        detail: { trailName: 'Cherokee Trail' },
      },
    ]);
  });
});

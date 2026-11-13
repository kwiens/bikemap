/** @vitest-environment jsdom */

import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mapSelectionHarness } from '@/test/map-selection';
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
  const selection = mapSelectionHarness();
  const wrapper = selection.Wrapper;

  afterEach(() => {
    window.history.replaceState(null, '', '/');
  });

  it('selects a trail from the query string by default', () => {
    window.history.replaceState(null, '', '/?trail=cherokee-trail');

    renderHook(() => useUrlDeepLink(), { wrapper });

    expect(selection.get()).toEqual({
      kind: 'trail',
      trailName: 'Cherokee Trail',
    });
  });

  it('ignores a trail in a Casual embed and selects the decoded route', () => {
    window.history.replaceState(
      null,
      '',
      '/embed?trail=cherokee-trail&route=riverwalk',
    );

    renderHook(
      () => useUrlDeepLink({ trails: false, routes: true, route: 'riverwalk' }),
      { wrapper },
    );

    expect(selection.get()).toEqual({
      kind: 'route',
      routeId: 'riverwalk-layer',
    });
  });

  it('ignores a route in an MTB embed', () => {
    window.history.replaceState(null, '', '/embed?mode=mtb&route=riverwalk');

    renderHook(
      () => useUrlDeepLink({ trails: true, routes: false, route: 'riverwalk' }),
      { wrapper },
    );

    expect(selection.get()).toBeNull();
  });

  it('prefers the pre-decoded trail over the raw query value', () => {
    window.history.replaceState(null, '', '/embed?mode=mtb&trail=%20');

    renderHook(
      () =>
        useUrlDeepLink({
          trails: true,
          routes: false,
          trail: 'cherokee-trail',
        }),
      { wrapper },
    );

    expect(selection.get()).toEqual({
      kind: 'trail',
      trailName: 'Cherokee Trail',
    });
  });

  it('uses the stable route id when a stale trail link cannot be resolved', () => {
    window.history.replaceState(
      null,
      '',
      '/?trail=removed&route=riverwalk-layer',
    );
    renderHook(() => useUrlDeepLink(), { wrapper });
    expect(selection.get()).toEqual({
      kind: 'route',
      routeId: 'riverwalk-layer',
    });
  });
});

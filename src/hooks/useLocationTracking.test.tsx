/** @vitest-environment jsdom */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MAP_EVENTS } from '@/events';
import { PlatformProvider } from '@/platform/context';
import type {
  PlatformServices,
  PositionError,
  PositionFix,
} from '@/platform/types';
import { useLocationTracking } from './useLocationTracking';

const markerInstances: FakeMarker[] = [];

class FakeMarker {
  lngLat = { lng: 0, lat: 0 };
  addTo = vi.fn(() => this);
  remove = vi.fn();
  setLngLat = vi.fn((next: { lng: number; lat: number }) => {
    this.lngLat = next;
    return this;
  });
  getLngLat = () => this.lngLat;
  constructor(lng: number, lat: number) {
    this.lngLat = { lng, lat };
    markerInstances.push(this);
  }
}

vi.mock('@/components/MapMarkers', () => ({
  createLocationMarker: (lng: number, lat: number) => new FakeMarker(lng, lat),
  updateAccuracyCircle: vi.fn(),
}));

const FIX: PositionFix = {
  lng: -85.3,
  lat: 35.0,
  accuracy: 6,
  altitude: null,
  altitudeAccuracy: null,
  speed: 4,
  heading: 90,
  timestamp: 1,
};

function fakePlatform() {
  let onFix: ((fix: PositionFix) => void) | null = null;
  let onError: ((error: PositionError) => void) | null = null;
  let onHeading: ((deg: number) => void) | null = null;
  const unsubscribe = vi.fn();
  const stopHeading = vi.fn();
  const requestFix = vi.fn().mockReturnValue(new Promise(() => {}));
  const requestPermission = vi.fn().mockResolvedValue(true);
  const services = {
    kind: 'web',
    positions: {
      subscribe: vi.fn((fix, error) => {
        onFix = fix;
        onError = error;
        return unsubscribe;
      }),
      latest: () => null,
      requestFix,
    },
    heading: {
      isSupported: () => true,
      requestPermission,
      watchHeading: vi.fn((cb) => {
        onHeading = cb;
        return stopHeading;
      }),
    },
  } as unknown as PlatformServices;
  return {
    services,
    unsubscribe,
    stopHeading,
    requestFix,
    requestPermission,
    emit: (fix: PositionFix) => onFix?.(fix),
    fail: (error: PositionError) => onError?.(error),
    turn: (deg: number) => onHeading?.(deg),
  };
}

function fakeMap() {
  return {
    flyTo: vi.fn(),
    easeTo: vi.fn(),
    jumpTo: vi.fn(),
    getZoom: () => 14,
    isMoving: () => false,
    isZooming: () => false,
  };
}

function renderTracking(platform: ReturnType<typeof fakePlatform>) {
  const map = fakeMap();
  const mapRef = { current: map as unknown as mapboxgl.Map };
  const pauseRecenterUntil = { current: 0 };
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <PlatformProvider services={platform.services}>{children}</PlatformProvider>
  );
  const hook = renderHook(
    () => useLocationTracking({ map: mapRef, pauseRecenterUntil }),
    { wrapper },
  );
  return { ...hook, map, pauseRecenterUntil };
}

describe('useLocationTracking', () => {
  beforeEach(() => {
    markerInstances.length = 0;
    vi.useRealTimers();
  });

  it('does not touch the GPS until tracking is switched on', () => {
    const platform = fakePlatform();
    renderTracking(platform);
    expect(platform.services.positions.subscribe).not.toHaveBeenCalled();
  });

  it('paints the dot, flies to the first fix and broadcasts LOCATION_UPDATE', () => {
    const platform = fakePlatform();
    const { result, map } = renderTracking(platform);
    const updates: unknown[] = [];
    const handler = (e: Event) => updates.push((e as CustomEvent).detail);
    window.addEventListener(MAP_EVENTS.LOCATION_UPDATE, handler);

    try {
      act(() => result.current.setTracking(true));
      expect(result.current.isTracking).toBe(true);
      expect(platform.services.positions.subscribe).toHaveBeenCalledTimes(1);
      // A cached coarse fix is requested for the cold start.
      expect(platform.requestFix).toHaveBeenCalledWith(
        expect.objectContaining({ highAccuracy: false }),
      );

      act(() => platform.emit(FIX));
      expect(markerInstances).toHaveLength(1);
      expect(markerInstances[0].addTo).toHaveBeenCalledWith(map);
      expect(map.flyTo).toHaveBeenCalledWith(
        expect.objectContaining({ center: [FIX.lng, FIX.lat] }),
      );
      expect(updates).toEqual([{ lng: FIX.lng, lat: FIX.lat }]);

      // Later fixes move the dot without flying again.
      act(() => platform.emit({ ...FIX, lng: -85.31 }));
      expect(markerInstances).toHaveLength(1);
      expect(markerInstances[0].setLngLat).toHaveBeenCalledWith({
        lng: -85.31,
        lat: FIX.lat,
      });
      expect(map.flyTo).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener(MAP_EVENTS.LOCATION_UPDATE, handler);
    }
  });

  it('recenters on an interval while tracking, honouring the pause', () => {
    vi.useFakeTimers();
    const platform = fakePlatform();
    const { result, map, pauseRecenterUntil } = renderTracking(platform);
    act(() => result.current.setTracking(true));
    act(() => platform.emit(FIX));

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(map.jumpTo).toHaveBeenCalledWith({ center: [FIX.lng, FIX.lat] });

    pauseRecenterUntil.current = Date.now() + 10_000;
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(map.jumpTo).toHaveBeenCalledTimes(1);

    act(() => result.current.setTracking(false));
    pauseRecenterUntil.current = 0;
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(map.jumpTo).toHaveBeenCalledTimes(1);
    // The dot stays live after following is switched off.
    expect(platform.unsubscribe).not.toHaveBeenCalled();
    expect(map.easeTo).toHaveBeenCalledWith(
      expect.objectContaining({ duration: 500 }),
    );
  });

  it('cycles off → tracking → compass → off and rotates the map in compass mode', async () => {
    const platform = fakePlatform();
    const { result, map } = renderTracking(platform);

    await act(() => result.current.cycleMode());
    expect(result.current.isTracking).toBe(true);
    expect(result.current.isCompassMode).toBe(false);

    await act(() => result.current.cycleMode());
    expect(platform.requestPermission).toHaveBeenCalled();
    expect(result.current.isCompassMode).toBe(true);
    act(() => platform.turn(45));
    expect(map.easeTo).toHaveBeenCalledWith(
      expect.objectContaining({ bearing: 45 }),
    );

    await act(() => result.current.cycleMode());
    expect(result.current.isTracking).toBe(false);
    expect(result.current.isCompassMode).toBe(false);
    expect(platform.stopHeading).toHaveBeenCalled();
  });

  it('leaves compass mode when the north arrow is tapped and when permission is refused', async () => {
    const platform = fakePlatform();
    const { result } = renderTracking(platform);
    await act(() => result.current.cycleMode());
    await act(() => result.current.cycleMode());
    expect(result.current.isCompassMode).toBe(true);

    act(() => result.current.exitCompassMode());
    expect(result.current.isCompassMode).toBe(false);
    expect(result.current.isTracking).toBe(true);

    platform.requestPermission.mockResolvedValueOnce(false);
    await act(() => result.current.cycleMode());
    expect(result.current.isTracking).toBe(false);
  });

  it('drops the dot on a fatal GPS error but keeps it through timeouts', () => {
    const platform = fakePlatform();
    const { result } = renderTracking(platform);
    act(() => result.current.setTracking(true));
    act(() => platform.emit(FIX));

    act(() => platform.fail({ code: 'timeout', message: '' }));
    expect(markerInstances[0].remove).not.toHaveBeenCalled();
    expect(platform.unsubscribe).not.toHaveBeenCalled();
    act(() => platform.fail({ code: 'permission-denied', message: '' }));
    expect(markerInstances[0].remove).toHaveBeenCalled();
    // The subscription ends with the error, so the next opt-in subscribes
    // again and the shared watch restarts the hardware.
    expect(platform.unsubscribe).toHaveBeenCalledTimes(1);
    act(() => result.current.setTracking(false));
    act(() => result.current.setTracking(true));
    expect(platform.services.positions.subscribe).toHaveBeenCalledTimes(2);
  });

  it('releases the watch, the compass and the marker on unmount', async () => {
    const platform = fakePlatform();
    const { result, unmount } = renderTracking(platform);
    await act(() => result.current.cycleMode());
    await act(() => result.current.cycleMode());
    act(() => platform.emit(FIX));

    unmount();
    expect(platform.unsubscribe).toHaveBeenCalled();
    expect(platform.stopHeading).toHaveBeenCalled();
    expect(markerInstances[0].remove).toHaveBeenCalled();
  });
});

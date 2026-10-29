/** @vitest-environment jsdom */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRideRecording } from './useRideRecording';
import { MAP_EVENTS } from '@/events';

// Mock ride-storage
vi.mock('@/utils/ride-storage', () => ({
  saveRide: vi.fn().mockResolvedValue(undefined),
  saveInProgress: vi.fn().mockResolvedValue(undefined),
  clearInProgress: vi.fn().mockResolvedValue(undefined),
  loadInProgress: vi.fn().mockResolvedValue(null),
}));

// Keep the real elevation calculations; mock saved statistics and distance
vi.mock('@/utils/ride-stats', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/ride-stats')>();
  return {
    ...actual,
    computeRideStats: vi.fn().mockReturnValue({
      distance: 1000,
      movingTime: 600000,
      avgSpeed: 1.67,
      maxSpeed: 3.0,
      elevationGain: 50,
      elevationLoss: 30,
    }),
    computeBounds: vi.fn().mockReturnValue([-85.3, 35.0, -85.2, 35.1]),
    haversineDistance: vi.fn().mockReturnValue(100),
  };
});

// Mock ride data
vi.mock('@/data/ride', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/data/ride')>()),
  generateRideName: vi.fn().mockReturnValue('Test Ride'),
}));

// Track watchPosition callbacks
let positionCallback: PositionCallback | null = null;
let errorCallback: PositionErrorCallback | null = null;

function mockGeolocation() {
  const geo = {
    watchPosition: vi.fn((success, error) => {
      positionCallback = success;
      errorCallback = error;
      return 42; // watch ID
    }),
    clearWatch: vi.fn(),
    getCurrentPosition: vi.fn(),
  };
  Object.defineProperty(navigator, 'geolocation', {
    value: geo,
    writable: true,
    configurable: true,
  });
  return geo;
}

function simulatePosition(
  lng: number,
  lat: number,
  options: {
    speed?: number;
    accuracy?: number;
    altitude?: number;
  } = {},
) {
  positionCallback?.({
    coords: {
      longitude: lng,
      latitude: lat,
      speed: options.speed ?? 3.0,
      accuracy: options.accuracy ?? 5,
      altitude: options.altitude ?? 200,
      heading: 0,
      altitudeAccuracy: 5,
    },
    timestamp: Date.now(),
  } as GeolocationPosition);
}

describe('useRideRecording', () => {
  let geo: ReturnType<typeof mockGeolocation>;

  beforeEach(() => {
    vi.useFakeTimers();
    geo = mockGeolocation();
    positionCallback = null;
    errorCallback = null;

    // Mock crypto.randomUUID
    vi.stubGlobal('crypto', {
      randomUUID: vi.fn().mockReturnValue('test-uuid'),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('starts with default state', () => {
    const { result } = renderHook(() => useRideRecording());

    expect(result.current.isRecording).toBe(false);
    expect(result.current.isPaused).toBe(false);
    expect(result.current.elapsedTime).toBe(0);
    expect(result.current.liveDistance).toBe(0);
  });

  it('startRecording begins GPS watch and sets isRecording', () => {
    const { result } = renderHook(() => useRideRecording());

    act(() => {
      result.current.startRecording();
    });

    expect(result.current.isRecording).toBe(true);
    expect(geo.watchPosition).toHaveBeenCalled();
  });

  it('dispatches RIDE_RECORDING_START event on start', () => {
    const events: string[] = [];
    const handler = (e: Event) => events.push(e.type);
    window.addEventListener(MAP_EVENTS.RIDE_RECORDING_START, handler);
    try {
      const { result } = renderHook(() => useRideRecording());

      act(() => {
        result.current.startRecording();
      });

      expect(events).toContain(MAP_EVENTS.RIDE_RECORDING_START);
    } finally {
      window.removeEventListener(MAP_EVENTS.RIDE_RECORDING_START, handler);
    }
  });

  it('dispatches RIDE_RECORDING_UPDATE on GPS position', () => {
    const events: CustomEvent[] = [];
    const handler = (e: Event) => events.push(e as CustomEvent);
    window.addEventListener(MAP_EVENTS.RIDE_RECORDING_UPDATE, handler);
    try {
      const { result } = renderHook(() => useRideRecording());

      act(() => {
        result.current.startRecording();
      });

      act(() => {
        simulatePosition(-85.3, 35.0);
      });

      expect(events).toHaveLength(1);
      expect(events[0].detail.point).toEqual([-85.3, 35.0]);
    } finally {
      window.removeEventListener(MAP_EVENTS.RIDE_RECORDING_UPDATE, handler);
    }
  });

  it('pause and resume toggle isPaused', () => {
    const { result } = renderHook(() => useRideRecording());

    act(() => {
      result.current.startRecording();
    });

    act(() => {
      result.current.pauseRecording();
    });
    expect(result.current.isPaused).toBe(true);

    act(() => {
      result.current.resumeRecording();
    });
    expect(result.current.isPaused).toBe(false);
  });

  it('persists a segment break on the first point after manual resume', async () => {
    const { saveRide } = await import('@/utils/ride-storage');
    const { result } = renderHook(() => useRideRecording());

    act(() => {
      result.current.startRecording();
      simulatePosition(-85.3, 35);
      simulatePosition(-85.299, 35.001);
    });
    act(() => {
      result.current.pauseRecording();
      simulatePosition(-100, 40);
    });
    act(() => {
      result.current.resumeRecording();
      simulatePosition(-121.3, 44);
    });

    await act(async () => {
      await result.current.stopRecording();
    });

    const ride = (saveRide as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0];
    expect(ride.points).toHaveLength(3);
    expect(ride.points[2].segmentStart).toBe(true);
  });

  it('stopRecording returns null for short rides (< 2 points)', async () => {
    const { result } = renderHook(() => useRideRecording());

    act(() => {
      result.current.startRecording();
    });

    // Only 1 point — too short
    act(() => {
      simulatePosition(-85.3, 35.0);
    });

    let ride: unknown;
    await act(async () => {
      ride = await result.current.stopRecording();
    });

    expect(ride).toBeNull();
    expect(result.current.isRecording).toBe(false);
  });

  it('stopRecording saves and returns ride with 2+ points', async () => {
    const { saveRide } = await import('@/utils/ride-storage');
    const { result } = renderHook(() => useRideRecording());

    act(() => {
      result.current.startRecording();
    });

    act(() => {
      simulatePosition(-85.3, 35.0);
      simulatePosition(-85.31, 35.01);
    });

    let ride: unknown;
    await act(async () => {
      ride = await result.current.stopRecording();
    });

    expect(ride).not.toBeNull();
    expect(saveRide).toHaveBeenCalled();
    expect(result.current.isRecording).toBe(false);
  });

  it('dispatches RIDE_RECORDING_STOP on successful stop', async () => {
    const events: string[] = [];
    const handler = (e: Event) => events.push(e.type);
    window.addEventListener(MAP_EVENTS.RIDE_RECORDING_STOP, handler);

    try {
      const { result } = renderHook(() => useRideRecording());

      act(() => {
        result.current.startRecording();
      });

      act(() => {
        simulatePosition(-85.3, 35.0);
        simulatePosition(-85.31, 35.01);
      });

      await act(async () => {
        await result.current.stopRecording();
      });

      expect(events).toContain(MAP_EVENTS.RIDE_RECORDING_STOP);
    } finally {
      window.removeEventListener(MAP_EVENTS.RIDE_RECORDING_STOP, handler);
    }
  });

  it('dispatches RIDE_RECORDING_STOP even when ride is too short', async () => {
    const events: string[] = [];
    const handler = (e: Event) => events.push(e.type);
    window.addEventListener(MAP_EVENTS.RIDE_RECORDING_STOP, handler);

    try {
      const { result } = renderHook(() => useRideRecording());

      act(() => {
        result.current.startRecording();
      });

      await act(async () => {
        const ride = await result.current.stopRecording();
        expect(ride).toBeNull();
      });

      expect(events).toContain(MAP_EVENTS.RIDE_RECORDING_STOP);
    } finally {
      window.removeEventListener(MAP_EVENTS.RIDE_RECORDING_STOP, handler);
    }
  });

  it('starts a fresh elevation filter after moving while manually paused', () => {
    const { result } = renderHook(() => useRideRecording());
    act(() => {
      result.current.startRecording();
    });
    act(() => {
      simulatePosition(-85.3, 35, { altitude: 100 });
    });
    act(() => {
      result.current.pauseRecording();
    });
    act(() => {
      result.current.resumeRecording();
    });
    act(() => {
      for (const altitude of [1000, 1010, 1020, 1030]) {
        simulatePosition(-85.2, 35, { altitude });
      }
    });
    // Only the new segment's smoothed climb, never the paused 900 m jump.
    expect(result.current.liveElevationGain).toBeCloseTo(5.61);
  });

  it('auto-pauses silently without updating UI isPaused state', () => {
    const { result } = renderHook(() => useRideRecording());

    act(() => {
      result.current.startRecording();
    });

    // 3 consecutive low-speed readings trigger auto-pause (silent — refs only)
    act(() => {
      simulatePosition(-85.3, 35.0, { speed: 0.1 });
      simulatePosition(-85.3, 35.0, { speed: 0.1 });
      simulatePosition(-85.3, 35.0, { speed: 0.1 });
    });

    // Auto-pause doesn't flip isPaused — only manual pause does
    expect(result.current.isPaused).toBe(false);
  });

  it('cleans up on GPS permission error', () => {
    const onNotify = vi.fn();
    const { result } = renderHook(() => useRideRecording(onNotify));

    act(() => {
      result.current.startRecording();
    });

    // Simulate permission denied
    act(() => {
      errorCallback?.({
        code: 1,
        message: 'Permission denied',
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
      });
    });

    expect(result.current.isRecording).toBe(false);
    expect(onNotify).toHaveBeenCalledWith(
      'Location permission denied — cannot record ride',
    );
  });

  it('dispatches RIDE_RECORDING_STOP when GPS fails fatally mid-ride', () => {
    // The map tears down its recording mode (live track, wake lock, trail
    // auto-detect) on this event. A fatal GPS error used to skip it and leave
    // the map recording with no recorder behind it.
    const events: CustomEvent[] = [];
    const handler = (e: Event) => events.push(e as CustomEvent);
    window.addEventListener(MAP_EVENTS.RIDE_RECORDING_STOP, handler);

    try {
      const { result } = renderHook(() => useRideRecording());

      act(() => {
        result.current.startRecording();
      });
      act(() => {
        simulatePosition(-85.3, 35.0);
      });
      act(() => {
        // Permission revoked mid-ride (a loss of signal is not fatal).
        errorCallback?.({
          code: 1,
          message: 'Permission revoked',
          PERMISSION_DENIED: 1,
          POSITION_UNAVAILABLE: 2,
          TIMEOUT: 3,
        });
      });

      expect(events).toHaveLength(1);
      expect(events[0].detail).toEqual({});
      expect(result.current.isRecording).toBe(false);
    } finally {
      window.removeEventListener(MAP_EVENTS.RIDE_RECORDING_STOP, handler);
    }
  });

  it('keeps the in-progress record for recovery when GPS fails fatally mid-ride', async () => {
    const { saveInProgress, clearInProgress } = await import(
      '@/utils/ride-storage'
    );
    const { result } = renderHook(() => useRideRecording());

    act(() => {
      result.current.startRecording();
    });
    act(() => {
      simulatePosition(-85.3, 35.0);
      simulatePosition(-85.31, 35.01);
    });
    act(() => {
      // Permission revoked mid-ride (a loss of signal is not fatal).
      errorCallback?.({
        code: 1,
        message: 'Permission revoked',
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
      });
    });

    expect(saveInProgress).toHaveBeenCalledWith(
      expect.objectContaining({ points: expect.any(Array) }),
    );
    expect(clearInProgress).not.toHaveBeenCalled();
    expect(result.current.hasRecovery).toBe(true);
    expect(result.current.isRecording).toBe(false);
  });

  it('keeps recording through a loss of signal and warns once', () => {
    const onNotify = vi.fn();
    const { result } = renderHook(() => useRideRecording(onNotify));
    act(() => {
      result.current.startRecording();
    });
    act(() => {
      simulatePosition(-85.3, 35.0);
    });
    const lost = { code: 2, message: 'location unknown' };
    act(() => {
      errorCallback?.(lost as GeolocationPositionError);
      errorCallback?.(lost as GeolocationPositionError);
    });
    expect(result.current.isRecording).toBe(true);
    expect(onNotify).toHaveBeenCalledTimes(1);
    expect(onNotify).toHaveBeenCalledWith('GPS signal lost — still recording');

    // Signal back, then lost again: a fresh warning.
    act(() => {
      simulatePosition(-85.31, 35.01);
      errorCallback?.(lost as GeolocationPositionError);
    });
    expect(onNotify).toHaveBeenCalledTimes(2);
    expect(result.current.isRecording).toBe(true);
  });

  it('dispatches RIDE_RECORDING_STOP exactly once per stop, with the ride id', async () => {
    const events: CustomEvent[] = [];
    const handler = (e: Event) => events.push(e as CustomEvent);
    window.addEventListener(MAP_EVENTS.RIDE_RECORDING_STOP, handler);

    try {
      const { result } = renderHook(() => useRideRecording());

      act(() => {
        result.current.startRecording();
      });
      act(() => {
        simulatePosition(-85.3, 35.0);
        simulatePosition(-85.31, 35.01);
      });

      let rideId: string | undefined;
      await act(async () => {
        rideId = (await result.current.stopRecording())?.id;
      });

      expect(rideId).toBeDefined();
      expect(events).toHaveLength(1);
      expect(events[0].detail).toEqual({ rideId });
    } finally {
      window.removeEventListener(MAP_EVENTS.RIDE_RECORDING_STOP, handler);
    }
  });

  it('reports the stop outcome through onNotify', async () => {
    const onNotify = vi.fn();
    const { result } = renderHook(() => useRideRecording(onNotify));

    act(() => {
      result.current.startRecording();
    });
    await act(async () => {
      await result.current.stopRecording();
    });
    expect(onNotify).toHaveBeenLastCalledWith(
      'Ride too short to save — keep recording longer',
    );

    act(() => {
      result.current.startRecording();
    });
    act(() => {
      simulatePosition(-85.3, 35.0);
      simulatePosition(-85.31, 35.01);
    });
    await act(async () => {
      await result.current.stopRecording();
    });
    expect(onNotify).toHaveBeenLastCalledWith('Ride saved!');
  });

  it('freezes GPS and ignores queued errors while Finish is saving', async () => {
    const { saveInProgress, saveRide } = await import('@/utils/ride-storage');
    let finishCheckpoint!: () => void;
    vi.mocked(saveInProgress).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishCheckpoint = resolve;
        }),
    );
    const onNotify = vi.fn();
    const events: CustomEvent[] = [];
    const handler = (e: Event) => events.push(e as CustomEvent);
    window.addEventListener(MAP_EVENTS.RIDE_RECORDING_STOP, handler);
    try {
      const { result } = renderHook(() => useRideRecording(onNotify));
      act(() => {
        result.current.startRecording();
      });
      act(() => {
        simulatePosition(-85.3, 35.0);
        simulatePosition(-85.31, 35.01);
      });
      let stopping!: ReturnType<typeof result.current.stopRecording>;
      act(() => {
        stopping = result.current.stopRecording();
      });
      expect(geo.clearWatch).toHaveBeenCalledWith(42);
      act(() => {
        simulatePosition(-85.32, 35.02);
        errorCallback?.({ code: 2 } as GeolocationPositionError);
        vi.advanceTimersByTime(10_000);
      });
      expect(events).toHaveLength(0);
      expect(onNotify).not.toHaveBeenCalled();
      expect(saveInProgress).toHaveBeenCalledTimes(1);
      await act(async () => {
        finishCheckpoint();
        await stopping;
      });
      const savedRide = vi.mocked(saveRide).mock.calls[0][0];
      expect(savedRide.points).toHaveLength(2);
      expect(savedRide.endTime).toBe(savedRide.points[1].timestamp);
      expect(events).toHaveLength(1);
      expect(events[0].detail).toEqual({ rideId: 'test-uuid' });
      expect(onNotify).toHaveBeenCalledExactlyOnceWith('Ride saved!');
    } finally {
      window.removeEventListener(MAP_EVENTS.RIDE_RECORDING_STOP, handler);
    }
  });

  it('ignores callbacks from a failed GPS session after starting another ride', () => {
    const onNotify = vi.fn();
    const { result } = renderHook(() => useRideRecording(onNotify));
    act(() => {
      result.current.startRecording();
    });
    const oldError = errorCallback;
    act(() => {
      oldError?.({ code: 2 } as GeolocationPositionError);
    });
    act(() => {
      result.current.startRecording();
    });
    onNotify.mockClear();
    act(() => {
      oldError?.({ code: 1 } as GeolocationPositionError);
    });
    expect(result.current.isRecording).toBe(true);
    expect(onNotify).not.toHaveBeenCalled();
    expect(geo.clearWatch).toHaveBeenCalledTimes(1);
  });

  it('checkpoints a short ride and keeps recovery when the save throws', async () => {
    const { saveRide, saveInProgress, clearInProgress } = await import(
      '@/utils/ride-storage'
    );
    (saveRide as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('quota'),
    );
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const onNotify = vi.fn();
    const { result } = renderHook(() => useRideRecording(onNotify));

    act(() => {
      result.current.startRecording();
    });
    act(() => {
      simulatePosition(-85.3, 35.0);
      simulatePosition(-85.31, 35.01);
    });
    let ride: unknown;
    await act(async () => {
      ride = await result.current.stopRecording();
    });

    expect(ride).toBeNull();
    expect(saveInProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        points: expect.arrayContaining([
          expect.objectContaining({ lng: -85.3 }),
          expect.objectContaining({ lng: -85.31 }),
        ]),
      }),
    );
    expect(clearInProgress).not.toHaveBeenCalled();
    expect(onNotify).toHaveBeenCalledTimes(1);
    expect(onNotify).toHaveBeenCalledWith(
      'Could not save your ride — open Rides to recover it.',
    );
    expect(result.current.hasRecovery).toBe(true);
    consoleError.mockRestore();
  });

  it('aborts startup cleanly when the device has no geolocation', async () => {
    Object.defineProperty(navigator, 'geolocation', {
      value: undefined,
      writable: true,
      configurable: true,
    });
    const lifecycle: string[] = [];
    const handler = (e: Event) => lifecycle.push(e.type);
    window.addEventListener(MAP_EVENTS.RIDE_RECORDING_START, handler);
    window.addEventListener(MAP_EVENTS.RIDE_RECORDING_STOP, handler);
    const onNotify = vi.fn();

    try {
      const { result } = renderHook(() => useRideRecording(onNotify));
      await act(async () => {
        result.current.startRecording();
      });
      expect(result.current.isRecording).toBe(false);
      expect(onNotify).toHaveBeenCalledWith(
        'GPS unavailable — check your device settings',
      );
      // The map saw a start and then a stop, in that order — never a stop
      // followed by a start, which would leave it in recording mode.
      expect(lifecycle).toEqual([
        MAP_EVENTS.RIDE_RECORDING_START,
        MAP_EVENTS.RIDE_RECORDING_STOP,
      ]);
      // And a second attempt is not blocked by a leaked subscription.
      await act(async () => {
        result.current.startRecording();
      });
      expect(onNotify).toHaveBeenCalledTimes(2);
    } finally {
      window.removeEventListener(MAP_EVENTS.RIDE_RECORDING_START, handler);
      window.removeEventListener(MAP_EVENTS.RIDE_RECORDING_STOP, handler);
    }
  });

  it('clears the recovery record when a continued ride is saved before any fix', async () => {
    const { loadInProgress, clearInProgress, saveRide } = await import(
      '@/utils/ride-storage'
    );
    (loadInProgress as ReturnType<typeof vi.fn>).mockResolvedValue({
      startTime: Date.now() - 60000,
      points: [
        { lng: -85.3, lat: 35.0, altitude: 200, timestamp: Date.now() - 60000 },
        { lng: -85.31, lat: 35.01, altitude: 210, timestamp: Date.now() },
      ],
    });
    const { result } = renderHook(() => useRideRecording());
    await act(async () => {
      await result.current.continueRide();
    });
    (clearInProgress as ReturnType<typeof vi.fn>).mockClear();

    // Finish before the GPS has produced a single fix.
    await act(async () => {
      await result.current.stopRecording();
    });

    expect(saveRide).toHaveBeenCalled();
    expect(clearInProgress).toHaveBeenCalled();
    expect(result.current.hasRecovery).toBe(false);
    (loadInProgress as ReturnType<typeof vi.fn>).mockResolvedValue(null);
  });

  it('saves a recovered ride once even when Save it is tapped twice', async () => {
    const { loadInProgress, saveRide } = await import('@/utils/ride-storage');
    (loadInProgress as ReturnType<typeof vi.fn>).mockResolvedValue({
      startTime: Date.now() - 60000,
      points: [
        { lng: -85.3, lat: 35.0, altitude: 200, timestamp: Date.now() - 60000 },
        { lng: -85.31, lat: 35.01, altitude: 210, timestamp: Date.now() },
      ],
    });
    (saveRide as ReturnType<typeof vi.fn>).mockClear();
    const { result } = renderHook(() => useRideRecording());

    let rides: unknown[] = [];
    await act(async () => {
      rides = await Promise.all([
        result.current.recoverRide(),
        result.current.recoverRide(),
      ]);
    });

    expect(saveRide).toHaveBeenCalledTimes(1);
    expect(rides.filter(Boolean)).toHaveLength(1);
    (loadInProgress as ReturnType<typeof vi.fn>).mockResolvedValue(null);
  });

  it('checks for crash recovery on mount', async () => {
    const { loadInProgress } = await import('@/utils/ride-storage');
    (loadInProgress as ReturnType<typeof vi.fn>).mockResolvedValue({
      startTime: Date.now() - 60000,
      points: [
        { lng: -85.3, lat: 35.0, altitude: 200, timestamp: Date.now() - 60000 },
        { lng: -85.31, lat: 35.01, altitude: 210, timestamp: Date.now() },
      ],
    });

    const { result } = renderHook(() => useRideRecording());

    // Wait for async loadInProgress
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.hasRecovery).toBe(true);
  });
});

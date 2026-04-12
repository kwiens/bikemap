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

// Mock ride-stats
vi.mock('@/utils/ride-stats', () => ({
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
  MAX_ACCURACY_M: 20,
}));

// Mock ride data
vi.mock('@/data/ride', () => ({
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

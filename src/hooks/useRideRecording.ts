'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import type { RecordedRide, RidePoint, StoredRidePoint } from '../data/ride';
import { generateRideName } from '../data/ride';

type NotifyCallback = (message: string) => void;

// If no GPS point arrives for this long, the app was likely backgrounded
const BACKGROUND_GAP_THRESHOLD_MS = 15_000;
import { MAP_EVENTS } from '../events';
import {
  computeBounds,
  computeRideStats,
  haversineDistance,
} from '../utils/ride-stats';
import {
  saveRide,
  saveInProgress,
  clearInProgress,
  loadInProgress,
} from '../utils/ride-storage';

interface UseRideRecordingReturn {
  isRecording: boolean;
  isPaused: boolean;
  hasRecovery: boolean;
  elapsedTime: number; // seconds
  liveDistance: number; // meters
  liveElevationGain: number; // meters
  startRecording: () => void;
  pauseRecording: () => void;
  resumeRecording: () => void;
  stopRecording: () => Promise<RecordedRide | null>;
  recoverRide: () => Promise<RecordedRide | null>;
  dismissRecovery: () => void;
}

export function useRideRecording(
  onNotify?: NotifyCallback,
): UseRideRecordingReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [hasRecovery, setHasRecovery] = useState(false);

  const [elapsedTime, setElapsedTime] = useState(0);
  const [liveDistance, setLiveDistance] = useState(0);
  const [liveElevationGain, setLiveElevationGain] = useState(0);
  const distanceRef = useRef(0);
  const elevGainRef = useRef(0);
  const prevAltRef = useRef<number | null>(null);
  const pausedRef = useRef(false);
  const manualPauseRef = useRef(false); // true when user explicitly paused
  const pausedTimeRef = useRef(0); // accumulated paused ms
  const pauseStartRef = useRef(0);
  const lowSpeedCountRef = useRef(0); // consecutive low-speed GPS readings

  const saveIntervalRef = useRef<ReturnType<typeof setInterval> | undefined>(
    undefined,
  );
  const pointsRef = useRef<RidePoint[]>([]);
  const watchIdRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | undefined>(
    undefined,
  );
  const startTimeRef = useRef<number>(0);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  const acquireWakeLock = useCallback(async () => {
    if (!('wakeLock' in navigator)) return;
    try {
      wakeLockRef.current = await navigator.wakeLock.request('screen');
    } catch {
      // Wake lock not available or denied
    }
  }, []);

  const releaseWakeLock = useCallback(() => {
    if (wakeLockRef.current) {
      wakeLockRef.current.release();
      wakeLockRef.current = null;
    }
  }, []);

  // Re-acquire wake lock and detect GPS gaps when page becomes visible
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState !== 'visible' || !isRecording) return;
      if (pausedRef.current) return;

      acquireWakeLock();

      // Check for background gap
      const lastPoint = pointsRef.current[pointsRef.current.length - 1];
      if (lastPoint) {
        const gap = Date.now() - lastPoint.timestamp;
        if (gap > BACKGROUND_GAP_THRESHOLD_MS) {
          onNotify?.('GPS paused while app was in background — gap in track');
        }
      }

      // Request an immediate position fix to minimize the gap
      navigator.geolocation.getCurrentPosition(
        () => {}, // watchPosition will pick up the next point
        () => {},
        { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 },
      );
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () =>
      document.removeEventListener('visibilitychange', handleVisibility);
  }, [isRecording, acquireWakeLock, onNotify]);

  const cleanup = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (timerRef.current !== undefined) {
      clearInterval(timerRef.current);
      timerRef.current = undefined;
    }
    if (saveIntervalRef.current !== undefined) {
      clearInterval(saveIntervalRef.current);
      saveIntervalRef.current = undefined;
    }
    void clearInProgress();
    releaseWakeLock();
    setIsRecording(false);

    setElapsedTime(0);
    setLiveDistance(0);
    setLiveElevationGain(0);
  }, [releaseWakeLock]);

  const startRecording = useCallback(() => {
    if (isRecording) return;

    pointsRef.current = [];
    startTimeRef.current = Date.now();
    distanceRef.current = 0;
    elevGainRef.current = 0;
    prevAltRef.current = null;
    pausedRef.current = false;
    manualPauseRef.current = false;
    pausedTimeRef.current = 0;
    pauseStartRef.current = 0;
    lowSpeedCountRef.current = 0;

    setElapsedTime(0);
    setLiveDistance(0);
    setLiveElevationGain(0);
    setIsRecording(true);
    setIsPaused(false);

    acquireWakeLock();

    // Start GPS watch
    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const speed = position.coords.speed ?? 0;
        const AUTO_PAUSE_SPEED = 0.5; // m/s (~1.1 mph)
        const AUTO_PAUSE_COUNT = 3; // consecutive low-speed readings

        // Manual pause — skip everything
        if (manualPauseRef.current) return;

        // Auto-pause logic
        if (pausedRef.current) {
          // Currently auto-paused — check if moving again
          if (speed >= AUTO_PAUSE_SPEED) {
            // Resume
            pausedTimeRef.current += Date.now() - pauseStartRef.current;
            pausedRef.current = false;
            lowSpeedCountRef.current = 0;
            setIsPaused(false);
          }
          return;
        }

        // Not paused — check if we should auto-pause
        if (speed < AUTO_PAUSE_SPEED) {
          lowSpeedCountRef.current++;
          if (lowSpeedCountRef.current >= AUTO_PAUSE_COUNT) {
            pausedRef.current = true;
            pauseStartRef.current = Date.now();
            setIsPaused(true);
            return;
          }
        } else {
          lowSpeedCountRef.current = 0;
        }

        const point: RidePoint = {
          lng: position.coords.longitude,
          lat: position.coords.latitude,
          altitude: position.coords.altitude,
          accuracy: position.coords.accuracy,
          speed: position.coords.speed,
          timestamp: position.timestamp,
        };
        const prev = pointsRef.current[pointsRef.current.length - 1];
        pointsRef.current.push(point);

        // Broadcast coordinates for live map line and elevation profile
        window.dispatchEvent(
          new CustomEvent(MAP_EVENTS.RIDE_RECORDING_UPDATE, {
            detail: {
              coordinates: pointsRef.current.map((p) => [p.lng, p.lat]),
              points: pointsRef.current,
            },
          }),
        );

        // Accumulate live distance
        if (prev && point.accuracy < 30 && prev.accuracy < 30) {
          distanceRef.current += haversineDistance(
            prev.lat,
            prev.lng,
            point.lat,
            point.lng,
          );
          setLiveDistance(distanceRef.current);
        }

        // Accumulate live elevation gain
        if (point.altitude !== null) {
          if (prevAltRef.current !== null) {
            const delta = point.altitude - prevAltRef.current;
            if (delta > 0) {
              elevGainRef.current += delta;
              setLiveElevationGain(elevGainRef.current);
            }
          }
          prevAltRef.current = point.altitude;
        }
      },
      (error) => {
        const messages: Record<number, string> = {
          1: 'Location permission denied — cannot record ride',
          2: 'GPS unavailable — check your device settings',
          3: 'GPS timed out — trying again...',
        };
        const msg = messages[error.code] ?? 'GPS error';
        if (error.code !== 3) {
          // Timeout is transient; permission/unavailable are fatal
          cleanup();
          onNotify?.(msg);
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 5000,
      },
    );

    // Start elapsed time counter
    timerRef.current = setInterval(() => {
      const paused = pausedRef.current
        ? pausedTimeRef.current + (Date.now() - pauseStartRef.current)
        : pausedTimeRef.current;
      setElapsedTime(
        Math.floor((Date.now() - startTimeRef.current - paused) / 1000),
      );
    }, 1000);

    // Periodically save in-progress data for crash recovery
    saveIntervalRef.current = setInterval(() => {
      if (pointsRef.current.length > 0) {
        void saveInProgress({
          startTime: startTimeRef.current,
          points: pointsRef.current,
        });
      }
    }, 30_000);

    window.dispatchEvent(new CustomEvent(MAP_EVENTS.RIDE_RECORDING_START));
  }, [isRecording, acquireWakeLock, cleanup, onNotify]);

  const pauseRecording = useCallback(() => {
    if (!isRecording || manualPauseRef.current) return;
    manualPauseRef.current = true;
    if (!pausedRef.current) {
      pausedRef.current = true;
      pauseStartRef.current = Date.now();
    }
    setIsPaused(true);
  }, [isRecording]);

  const resumeRecording = useCallback(() => {
    if (!isRecording || !manualPauseRef.current) return;
    manualPauseRef.current = false;
    if (pausedRef.current) {
      pausedTimeRef.current += Date.now() - pauseStartRef.current;
      pausedRef.current = false;
    }
    lowSpeedCountRef.current = 0;
    setIsPaused(false);
  }, [isRecording]);

  const stopRecording = useCallback(async (): Promise<RecordedRide | null> => {
    if (!isRecording || pointsRef.current.length < 2) {
      cleanup();
      return null;
    }

    const points = [...pointsRef.current];
    const endTime = Date.now();
    const stats = computeRideStats(points);
    const bounds = computeBounds(points) ?? [0, 0, 0, 0];

    // Strip accuracy/speed — only needed for stats computation above
    const storedPoints: StoredRidePoint[] = points.map(
      ({ lng, lat, altitude, timestamp }) => ({
        lng,
        lat,
        altitude,
        timestamp,
      }),
    );

    const ride: RecordedRide = {
      id: crypto.randomUUID(),
      name: generateRideName(startTimeRef.current),
      startTime: startTimeRef.current,
      endTime,
      points: storedPoints,
      stats,
      bounds,
    };

    await saveRide(ride);
    cleanup();

    window.dispatchEvent(
      new CustomEvent(MAP_EVENTS.RIDE_RECORDING_STOP, {
        detail: { rideId: ride.id },
      }),
    );

    return ride;
  }, [isRecording, cleanup]);

  // Check for recoverable in-progress ride on mount
  useEffect(() => {
    loadInProgress().then((data) => {
      if (data && data.points.length >= 2) {
        setHasRecovery(true);
      }
    });
  }, []);

  const recoverRide = useCallback(async (): Promise<RecordedRide | null> => {
    const data = await loadInProgress();
    if (!data || data.points.length < 2) {
      await clearInProgress();
      setHasRecovery(false);
      return null;
    }

    const stats = computeRideStats(data.points);
    const bounds = computeBounds(data.points);
    const storedPoints: StoredRidePoint[] = data.points.map(
      ({ lng, lat, altitude, timestamp }) => ({
        lng,
        lat,
        altitude,
        timestamp,
      }),
    );

    const ride: RecordedRide = {
      id: crypto.randomUUID(),
      name: generateRideName(data.startTime),
      startTime: data.startTime,
      endTime: data.points[data.points.length - 1].timestamp,
      points: storedPoints,
      stats,
      bounds,
    };

    await saveRide(ride);
    await clearInProgress();
    setHasRecovery(false);
    return ride;
  }, []);

  const dismissRecovery = useCallback(() => {
    void clearInProgress();
    setHasRecovery(false);
  }, []);

  // Cleanup on unmount — use refs directly to avoid stale closure from cleanup()
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null)
        navigator.geolocation.clearWatch(watchIdRef.current);
      if (timerRef.current !== undefined) clearInterval(timerRef.current);
      if (saveIntervalRef.current !== undefined)
        clearInterval(saveIntervalRef.current);
      wakeLockRef.current?.release();
    };
  }, []);

  return {
    isRecording,
    isPaused,
    hasRecovery,
    elapsedTime,
    liveDistance,
    liveElevationGain,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    recoverRide,
    dismissRecovery,
  };
}

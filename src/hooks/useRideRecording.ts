'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import type { RecordedRide, RidePoint, StoredRidePoint } from '../data/ride';
import { generateRideName } from '../data/ride';

type NotifyCallback = (message: string) => void;

// If no GPS point arrives for this long, the app was likely backgrounded
const BACKGROUND_GAP_THRESHOLD_MS = 15_000;
import {
  ELEVATION_EMA_ALPHA as ALT_EMA_ALPHA,
  ELEVATION_DEAD_BAND as ALT_DEADBAND_M,
  ELEVATION_SPIKE_THRESHOLD as ALT_SPIKE_M,
  ELEVATION_MIN_DISTANCE as ALT_MIN_DIST_M,
  ELEVATION_MAX_ALT_ACCURACY as ALT_MAX_ACCURACY,
} from '../utils/ride-stats';
import { MAP_EVENTS } from '../events';
import {
  computeBounds,
  computeDistance,
  computeElevation,
  computeRideStats,
  haversineDistance,
  MAX_ACCURACY_M,
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
  continueRide: () => Promise<void>;
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
  const emaAltRef = useRef<number | null>(null); // EMA-smoothed altitude
  const altAnchorRef = useRef<number | null>(null); // last committed altitude for deadband
  const distSinceAnchorRef = useRef(0); // horizontal meters since last anchor update
  const pausedRef = useRef(false);
  const manualPauseRef = useRef(false); // true when user explicitly paused
  const pausedTimeRef = useRef(0); // accumulated paused ms
  const pauseStartRef = useRef(0);
  const lowSpeedCountRef = useRef(0); // consecutive low-speed GPS readings
  const preserveProgressRef = useRef(false); // keep in-progress data if GPS fails during continue

  const saveIntervalRef = useRef<ReturnType<typeof setInterval> | undefined>(
    undefined,
  );
  const pointsRef = useRef<RidePoint[]>([]);
  const watchIdRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | undefined>(
    undefined,
  );
  const startTimeRef = useRef<number>(0);

  // Detect GPS gaps and request immediate fix when page becomes visible
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState !== 'visible' || !isRecording) return;
      if (pausedRef.current) return;

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
  }, [isRecording, onNotify]);

  // Warn before closing tab while recording
  useEffect(() => {
    if (!isRecording) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isRecording]);

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
    if (preserveProgressRef.current) {
      preserveProgressRef.current = false;
      setHasRecovery(true); // re-show recovery banner so user can retry or save
      // Clear the map's live ride layer so a retry doesn't double-append points
      window.dispatchEvent(new CustomEvent(MAP_EVENTS.RIDE_RECORDING_STOP));
    } else {
      void clearInProgress();
    }
    setIsRecording(false);
    setIsPaused(false);
    setElapsedTime(0);
    setLiveDistance(0);
    setLiveElevationGain(0);
  }, []);

  // Shared: start GPS watch, elapsed timer, and periodic save
  const startGpsWatchAndTimers = useCallback(() => {
    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const speed = position.coords.speed ?? 0;
        const AUTO_PAUSE_SPEED = 0.5; // m/s (~1.1 mph)
        const AUTO_PAUSE_COUNT = 3; // consecutive low-speed readings

        // Manual pause — skip everything
        if (manualPauseRef.current) return;

        // Auto-pause logic (silent — doesn't update UI isPaused state)
        if (pausedRef.current) {
          // Currently auto-paused — check if moving again
          if (speed >= AUTO_PAUSE_SPEED) {
            pausedTimeRef.current += Date.now() - pauseStartRef.current;
            pausedRef.current = false;
            lowSpeedCountRef.current = 0;
          }
          return;
        }

        // Not paused — check if we should auto-pause
        if (speed < AUTO_PAUSE_SPEED) {
          lowSpeedCountRef.current++;
          if (lowSpeedCountRef.current >= AUTO_PAUSE_COUNT) {
            pausedRef.current = true;
            pauseStartRef.current = Date.now();
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

        // GPS is confirmed working — safe to clear progress on future cleanup
        preserveProgressRef.current = false;

        window.dispatchEvent(
          new CustomEvent(MAP_EVENTS.RIDE_RECORDING_UPDATE, {
            detail: { point: [point.lng, point.lat] as [number, number] },
          }),
        );

        if (
          prev &&
          point.accuracy < MAX_ACCURACY_M &&
          prev.accuracy < MAX_ACCURACY_M
        ) {
          distanceRef.current += haversineDistance(
            prev.lat,
            prev.lng,
            point.lat,
            point.lng,
          );
          setLiveDistance(distanceRef.current);
        }

        // Accumulate horizontal distance for min-distance check
        if (prev) {
          distSinceAnchorRef.current += haversineDistance(
            prev.lat,
            prev.lng,
            point.lat,
            point.lng,
          );
        }

        // Filter 1: skip readings with poor altitude accuracy
        const altAccuracy = position.coords.altitudeAccuracy;
        const altUsable =
          point.altitude !== null &&
          (altAccuracy === null || altAccuracy <= ALT_MAX_ACCURACY);

        if (altUsable) {
          let alt = point.altitude!;

          // Filter 2: spike rejection — replace outlier jumps with current EMA
          if (
            emaAltRef.current !== null &&
            Math.abs(alt - emaAltRef.current) > ALT_SPIKE_M
          ) {
            alt = emaAltRef.current;
          }

          // EMA smoothing
          if (emaAltRef.current === null) {
            emaAltRef.current = alt;
            altAnchorRef.current = alt;
          } else {
            emaAltRef.current =
              ALT_EMA_ALPHA * alt + (1 - ALT_EMA_ALPHA) * emaAltRef.current;

            // Filter 3: require minimum horizontal distance before anchor update
            if (distSinceAnchorRef.current >= ALT_MIN_DIST_M) {
              const delta = emaAltRef.current - altAnchorRef.current!;
              if (delta > ALT_DEADBAND_M) {
                elevGainRef.current += delta;
                setLiveElevationGain(elevGainRef.current);
                altAnchorRef.current = emaAltRef.current;
              } else if (delta < -ALT_DEADBAND_M) {
                altAnchorRef.current = emaAltRef.current;
              }
            }
          }
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
      const next = Math.floor(
        (Date.now() - startTimeRef.current - paused) / 1000,
      );
      setElapsedTime((prev) => (prev === next ? prev : next));
    }, 1000);

    // Periodically save in-progress data for crash recovery
    saveIntervalRef.current = setInterval(() => {
      if (pointsRef.current.length > 0) {
        saveInProgress({
          startTime: startTimeRef.current,
          points: pointsRef.current,
        }).catch(() => {});
      }
    }, 10_000);

    window.dispatchEvent(new CustomEvent(MAP_EVENTS.RIDE_RECORDING_START));
  }, [cleanup, onNotify]);

  const startRecording = useCallback(() => {
    if (isRecording) return;

    pointsRef.current = [];
    startTimeRef.current = Date.now();
    distanceRef.current = 0;
    elevGainRef.current = 0;
    emaAltRef.current = null;
    altAnchorRef.current = null;
    distSinceAnchorRef.current = 0;
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

    startGpsWatchAndTimers();
  }, [isRecording, startGpsWatchAndTimers]);

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
    if (!isRecording || !pausedRef.current) return;
    manualPauseRef.current = false;
    pausedTimeRef.current += Date.now() - pauseStartRef.current;
    pausedRef.current = false;
    lowSpeedCountRef.current = 0;
    setIsPaused(false);
  }, [isRecording]);

  function buildRide(
    points: RidePoint[],
    startTime: number,
    endTime: number,
  ): RecordedRide {
    const stats = computeRideStats(points);
    const bounds = computeBounds(points) ?? [0, 0, 0, 0];
    const storedPoints: StoredRidePoint[] = points.map(
      ({ lng, lat, altitude, timestamp }) => ({
        lng,
        lat,
        altitude,
        timestamp,
      }),
    );
    return {
      id: crypto.randomUUID(),
      name: generateRideName(startTime),
      startTime,
      endTime,
      points: storedPoints,
      stats,
      bounds,
    };
  }

  const stopRecording = useCallback(async (): Promise<RecordedRide | null> => {
    if (!isRecording) return null;
    if (pointsRef.current.length < 2) {
      cleanup();
      window.dispatchEvent(new CustomEvent(MAP_EVENTS.RIDE_RECORDING_STOP));
      return null;
    }

    const rawPoints = [...pointsRef.current];
    // Apply DEM elevation correction before computing final stats
    let points: RidePoint[];
    try {
      const { correctElevations } = await import('../utils/dem');
      points = await correctElevations(rawPoints);
    } catch {
      points = rawPoints; // Fall back to GPS altitude if DEM unavailable
    }
    const ride = buildRide(points, startTimeRef.current, Date.now());

    await saveRide(ride);
    cleanup();

    window.dispatchEvent(
      new CustomEvent(MAP_EVENTS.RIDE_RECORDING_STOP, {
        detail: { rideId: ride.id },
      }),
    );

    return ride;
  }, [isRecording, cleanup]);

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

    let points = data.points;
    try {
      const { correctElevations } = await import('../utils/dem');
      points = await correctElevations(points);
    } catch {
      // Fall back to GPS altitude
    }
    const ride = buildRide(
      points,
      data.startTime,
      points[points.length - 1].timestamp,
    );

    await saveRide(ride);
    await clearInProgress();
    setHasRecovery(false);
    return ride;
  }, []);

  const continueRide = useCallback(async () => {
    if (isRecording) return;
    const data = await loadInProgress();
    if (!data || data.points.length < 2) {
      await clearInProgress();
      setHasRecovery(false);
      return;
    }

    // Pre-load saved points and restore accumulated stats
    pointsRef.current = [...data.points];
    startTimeRef.current = data.startTime;
    const lastPoint = data.points[data.points.length - 1];

    // Treat the gap between last saved point and now as paused time
    pausedTimeRef.current = Date.now() - lastPoint.timestamp;
    pauseStartRef.current = 0;
    pausedRef.current = false;
    manualPauseRef.current = false;
    lowSpeedCountRef.current = 0;

    // Recompute distance from saved points
    const dist = computeDistance(data.points);
    distanceRef.current = dist;

    // Use smoothed elevation computation (matches saved ride stats)
    const elev = computeElevation(data.points);
    elevGainRef.current = elev.gain;

    // Seed EMA from the last altitude in saved points for live smoothing
    const lastAlt =
      [...data.points].reverse().find((p) => p.altitude !== null)?.altitude ??
      null;
    emaAltRef.current = lastAlt;
    altAnchorRef.current = lastAlt;
    distSinceAnchorRef.current = 0;

    setLiveDistance(dist);
    setLiveElevationGain(elev.gain);
    setHasRecovery(false);
    setIsRecording(true);
    setIsPaused(false);

    // Preserve in-progress data until GPS confirms working — if GPS fails
    // immediately, cleanup won't wipe the saved ride so the user can still
    // fall back to "Save it".
    preserveProgressRef.current = true;

    // Draw existing track on map in a single batch
    const coords = data.points.map(
      (pt) => [pt.lng, pt.lat] as [number, number],
    );
    window.dispatchEvent(
      new CustomEvent(MAP_EVENTS.RIDE_RECORDING_UPDATE, {
        detail: { points: coords },
      }),
    );

    startGpsWatchAndTimers();
  }, [isRecording, startGpsWatchAndTimers]);

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
    continueRide,
    dismissRecovery,
  };
}

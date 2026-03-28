'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import type { RecordedRide, RidePoint } from '../data/ride';
import { generateRideName } from '../data/ride';
import { MAP_EVENTS } from '../events';
import {
  computeBounds,
  computeRideStats,
  haversineDistance,
} from '../utils/ride-stats';
import { saveRide } from '../utils/ride-storage';

interface UseRideRecordingReturn {
  isRecording: boolean;
  isPaused: boolean;
  pointCount: number;
  elapsedTime: number; // seconds
  liveDistance: number; // meters
  liveElevationGain: number; // meters
  startRecording: () => void;
  pauseRecording: () => void;
  resumeRecording: () => void;
  stopRecording: () => RecordedRide | null;
  discardRecording: () => void;
}

export function useRideRecording(): UseRideRecordingReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [pointCount, setPointCount] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [liveDistance, setLiveDistance] = useState(0);
  const [liveElevationGain, setLiveElevationGain] = useState(0);
  const distanceRef = useRef(0);
  const elevGainRef = useRef(0);
  const prevAltRef = useRef<number | null>(null);
  const pausedRef = useRef(false);
  const pausedTimeRef = useRef(0); // accumulated paused ms
  const pauseStartRef = useRef(0);

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

  // Re-acquire wake lock when page becomes visible again
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && isRecording) {
        acquireWakeLock();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () =>
      document.removeEventListener('visibilitychange', handleVisibility);
  }, [isRecording, acquireWakeLock]);

  const startRecording = useCallback(() => {
    if (isRecording) return;

    pointsRef.current = [];
    startTimeRef.current = Date.now();
    distanceRef.current = 0;
    elevGainRef.current = 0;
    prevAltRef.current = null;
    pausedRef.current = false;
    pausedTimeRef.current = 0;
    pauseStartRef.current = 0;
    setPointCount(0);
    setElapsedTime(0);
    setLiveDistance(0);
    setLiveElevationGain(0);
    setIsRecording(true);
    setIsPaused(false);

    acquireWakeLock();

    // Start GPS watch
    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        if (pausedRef.current) return;

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
        setPointCount(pointsRef.current.length);

        // Broadcast coordinates for live map line
        window.dispatchEvent(
          new CustomEvent(MAP_EVENTS.RIDE_RECORDING_UPDATE, {
            detail: {
              coordinates: pointsRef.current.map((p) => [p.lng, p.lat]),
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
      undefined,
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

    window.dispatchEvent(new CustomEvent(MAP_EVENTS.RIDE_RECORDING_START));
  }, [isRecording, acquireWakeLock]);

  const pauseRecording = useCallback(() => {
    if (!isRecording || pausedRef.current) return;
    pausedRef.current = true;
    pauseStartRef.current = Date.now();
    setIsPaused(true);
  }, [isRecording]);

  const resumeRecording = useCallback(() => {
    if (!isRecording || !pausedRef.current) return;
    pausedTimeRef.current += Date.now() - pauseStartRef.current;
    pausedRef.current = false;
    setIsPaused(false);
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
    releaseWakeLock();
    setIsRecording(false);
    setPointCount(0);
    setElapsedTime(0);
    setLiveDistance(0);
    setLiveElevationGain(0);
  }, [releaseWakeLock]);

  const stopRecording = useCallback((): RecordedRide | null => {
    if (!isRecording || pointsRef.current.length < 2) {
      cleanup();
      return null;
    }

    const points = [...pointsRef.current];
    const endTime = Date.now();
    const stats = computeRideStats(points);
    const bounds = computeBounds(points);

    const ride: RecordedRide = {
      id: crypto.randomUUID(),
      name: generateRideName(startTimeRef.current),
      startTime: startTimeRef.current,
      endTime,
      points,
      stats,
      bounds,
    };

    saveRide(ride);
    cleanup();

    window.dispatchEvent(
      new CustomEvent(MAP_EVENTS.RIDE_RECORDING_STOP, {
        detail: { rideId: ride.id },
      }),
    );

    return ride;
  }, [isRecording, cleanup]);

  const discardRecording = useCallback(() => {
    cleanup();
  }, [cleanup]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      if (timerRef.current !== undefined) {
        clearInterval(timerRef.current);
      }
      if (wakeLockRef.current) {
        wakeLockRef.current.release();
      }
    };
  }, []);

  return {
    isRecording,
    isPaused,
    pointCount,
    elapsedTime,
    liveDistance,
    liveElevationGain,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    discardRecording,
  };
}

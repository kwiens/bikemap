'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import type { RecordedRide, RidePoint } from '../data/ride';
import { generateRideName } from '../data/ride';
import { MAP_EVENTS } from '../events';
import { computeBounds, computeRideStats } from '../utils/ride-stats';
import { saveRide } from '../utils/ride-storage';

interface UseRideRecordingReturn {
  isRecording: boolean;
  pointCount: number;
  elapsedTime: number; // seconds
  startRecording: () => void;
  stopRecording: () => RecordedRide | null;
  discardRecording: () => void;
}

export function useRideRecording(): UseRideRecordingReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [pointCount, setPointCount] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);

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
    setPointCount(0);
    setElapsedTime(0);
    setIsRecording(true);

    acquireWakeLock();

    // Start GPS watch
    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const point: RidePoint = {
          lng: position.coords.longitude,
          lat: position.coords.latitude,
          altitude: position.coords.altitude,
          accuracy: position.coords.accuracy,
          speed: position.coords.speed,
          timestamp: position.timestamp,
        };
        pointsRef.current.push(point);
        setPointCount(pointsRef.current.length);
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
      setElapsedTime(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);

    window.dispatchEvent(new CustomEvent(MAP_EVENTS.RIDE_RECORDING_START));
  }, [isRecording, acquireWakeLock]);

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
    pointCount,
    elapsedTime,
    startRecording,
    stopRecording,
    discardRecording,
  };
}

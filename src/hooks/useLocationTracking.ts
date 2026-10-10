'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';
import type mapboxgl from 'mapbox-gl';
import {
  createLocationMarker,
  updateAccuracyCircle,
} from '@/components/MapMarkers';
import { mapConfig } from '@/config/map.config';
import { MAP_EVENTS, dispatchMapEvent } from '@/events';
import { usePlatform } from '@/platform/context';
import type { PositionFix, Unsubscribe } from '@/platform/types';
import { HeadingSmoother, type GpsReading } from '@/utils/compass';

// jumpTo (no animation) so the map is never mid-flight, which would block
// route-layer tap events.
const RECENTER_INTERVAL_MS = 1_000;
// Bearing changes smaller than this are jitter, not a turn.
const MIN_BEARING_CHANGE_DEG = 1;
// A cached, coarse fix paints the dot on tap instead of waiting for the live
// watch (maximumAge 0) to acquire a fresh high-accuracy fix on an iOS cold
// start.
const COLD_START_FIX = {
  highAccuracy: false,
  maximumAgeMs: 60_000,
  timeoutMs: 5_000,
};

interface UseLocationTrackingOptions {
  map: RefObject<mapboxgl.Map | null>;
  /**
   * Timestamp until which auto-recentering is suppressed. Owned by the map,
   * which extends it after its own fly-tos and after user gestures.
   */
  pauseRecenterUntil: RefObject<number>;
}

export interface LocationTracking {
  /** The map follows the rider's position. */
  isTracking: boolean;
  /** The map also rotates to the rider's heading. Implies isTracking. */
  isCompassMode: boolean;
  setTracking: (on: boolean) => void;
  /** The locate button: off → tracking → compass → off. */
  cycleMode: () => Promise<void>;
  /** Mapbox's north-arrow button resets the bearing; leave compass mode too. */
  exitCompassMode: () => void;
  /** Re-fit the accuracy circle after the map zooms. */
  syncAccuracyCircle: () => void;
}

/**
 * The rider's location on the map: the blue dot and its accuracy circle, the
 * follow-me recentering, and compass (heading-up) mode.
 *
 * Positions come from the platform's shared watch, which the ride recorder
 * also subscribes to, so recording and tracking never run two GPS watches.
 * The watch is started on the first explicit opt-in (locate button, or a
 * recording) — never on map load. Once started it stays on for the life of
 * the map even with following switched off, so a rider can turn following
 * off, pan around, and still see where they are.
 */
export function useLocationTracking({
  map,
  pauseRecenterUntil,
}: UseLocationTrackingOptions): LocationTracking {
  const { positions, heading } = usePlatform();
  const [isTracking, setIsTracking] = useState(false);
  const [isCompassMode, setIsCompassMode] = useState(false);

  const marker = useRef<mapboxgl.Marker | null>(null);
  const accuracy = useRef(0);
  const stopPositions = useRef<Unsubscribe | null>(null);
  const recenterTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  // Set when tracking is enabled before any fix exists: the next fix flies
  // the map there (iOS cold start otherwise leaves the map where it was).
  const flyToNextFix = useRef(false);
  const stopHeading = useRef<Unsubscribe | null>(null);
  const compassHeading = useRef<number | null>(null);
  // Course over ground from the last moving fix: at speed it beats the
  // magnetometer, which bike frames and cars pull around.
  const gpsHeading = useRef<GpsReading | null>(null);

  const syncAccuracyCircle = useCallback(() => {
    if (!map.current || !marker.current || accuracy.current <= 0) return;
    updateAccuracyCircle(
      marker.current,
      accuracy.current,
      map.current.getZoom(),
    );
  }, [map]);

  // Paint a fix: create or move the dot, size the circle, tell listeners.
  const paintFix = useCallback(
    (fix: PositionFix) => {
      const currentMap = map.current;
      if (!currentMap) return;
      if (marker.current) {
        marker.current.setLngLat({ lng: fix.lng, lat: fix.lat });
      } else {
        marker.current = createLocationMarker(fix.lng, fix.lat);
        marker.current.addTo(currentMap);
      }
      accuracy.current = fix.accuracy;
      updateAccuracyCircle(marker.current, fix.accuracy, currentMap.getZoom());

      if (flyToNextFix.current) {
        flyToNextFix.current = false;
        currentMap.flyTo({
          center: [fix.lng, fix.lat],
          essential: true,
          duration: 1000,
        });
      }

      dispatchMapEvent(MAP_EVENTS.LOCATION_UPDATE, {
        lng: fix.lng,
        lat: fix.lat,
      });
    },
    [map],
  );

  const ensureWatching = useCallback(() => {
    if (stopPositions.current) return;
    stopPositions.current = positions.subscribe(
      (fix) => {
        gpsHeading.current =
          fix.speed !== null && fix.heading !== null && fix.speed > 0
            ? { heading: fix.heading, speed: fix.speed }
            : null;
        paintFix(fix);
      },
      (error) => {
        // Timeouts are routine indoors and under tree cover; keep the dot and
        // wait. Only a lost permission or no provider takes it down.
        if (error.code === 'timeout') return;
        marker.current?.remove();
        marker.current = null;
      },
    );
  }, [positions, paintFix]);

  const stopCompass = useCallback(() => {
    stopHeading.current?.();
    stopHeading.current = null;
    compassHeading.current = null;
    setIsCompassMode(false);
  }, []);

  const startCompass = useCallback(() => {
    const smoother = new HeadingSmoother();
    stopHeading.current = heading.watchHeading((raw) => {
      const smoothed = smoother.update(raw, gpsHeading.current);
      if (smoothed === null) return;
      const previous = compassHeading.current;
      if (previous !== null) {
        let diff = Math.abs(smoothed - previous);
        if (diff > 180) diff = 360 - diff;
        if (diff < MIN_BEARING_CHANGE_DEG) return;
      }
      compassHeading.current = smoothed;
      map.current?.easeTo({
        bearing: smoothed,
        duration: 50,
        easing: (t) => t,
      });
    });
    setIsCompassMode(true);
  }, [heading, map]);

  const setTracking = useCallback(
    (on: boolean) => {
      setIsTracking(on);
      if (on) {
        ensureWatching();
        const currentMap = map.current;
        if (currentMap && marker.current) {
          const { lng, lat } = marker.current.getLngLat();
          currentMap.flyTo({
            center: [lng, lat],
            essential: true,
            duration: 1000,
          });
        } else if (currentMap) {
          flyToNextFix.current = true;
          positions
            .requestFix(COLD_START_FIX)
            .then((fix) => {
              // The live watch may have painted first.
              if (!marker.current) paintFix(fix);
            })
            .catch(() => {});
        }

        // Clear any prior interval so re-enabling can't leak a duplicate.
        if (recenterTimer.current) clearInterval(recenterTimer.current);
        recenterTimer.current = setInterval(() => {
          const liveMap = map.current;
          if (!liveMap || !marker.current) return;
          // Don't fight a pinch-zoom or drag in progress (#57), and respect
          // the cooldown after a fly-to or gesture.
          if (liveMap.isMoving() || liveMap.isZooming()) return;
          if (Date.now() < pauseRecenterUntil.current) return;
          const { lng, lat } = marker.current.getLngLat();
          const camera: mapboxgl.CameraOptions = { center: [lng, lat] };
          if (compassHeading.current !== null) {
            camera.bearing = compassHeading.current;
          }
          liveMap.jumpTo(camera);
        }, RECENTER_INTERVAL_MS);
      } else {
        if (recenterTimer.current) {
          clearInterval(recenterTimer.current);
          recenterTimer.current = null;
        }
        flyToNextFix.current = false;
        stopCompass();
        map.current?.easeTo({
          bearing: mapConfig.defaultView.bearing,
          duration: 500,
        });
      }
    },
    [map, pauseRecenterUntil, positions, paintFix, ensureWatching, stopCompass],
  );

  // Mirrors for cycleMode, which must read the current mode without being
  // recreated (the map's init effect wires it up once).
  const isTrackingRef = useRef(false);
  isTrackingRef.current = isTracking;
  const isCompassModeRef = useRef(false);
  isCompassModeRef.current = isCompassMode;

  // The permission request stays in this call chain (not a nested async) so
  // it remains inside the user-gesture context Safari requires.
  const cycleMode = useCallback(async () => {
    if (!isTrackingRef.current) {
      setTracking(true);
    } else if (!isCompassModeRef.current) {
      if (!(await heading.requestPermission())) {
        setTracking(false);
        return;
      }
      startCompass();
    } else {
      setTracking(false);
    }
  }, [heading, setTracking, startCompass]);

  // Teardown with the map.
  useEffect(() => {
    return () => {
      stopPositions.current?.();
      stopPositions.current = null;
      if (recenterTimer.current) clearInterval(recenterTimer.current);
      stopHeading.current?.();
      marker.current?.remove();
      marker.current = null;
    };
  }, []);

  return {
    isTracking,
    isCompassMode,
    setTracking,
    cycleMode,
    exitCompassMode: stopCompass,
    syncAccuracyCircle,
  };
}

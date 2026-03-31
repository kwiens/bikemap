import { useRef, useState, useCallback, useEffect } from 'react';
import type mapboxgl from 'mapbox-gl';
import { createLocationMarker } from '@/components/MapMarkers';

interface UseLocationTrackingOptions {
  map: React.MutableRefObject<mapboxgl.Map | null>;
}

interface UseLocationTrackingReturn {
  isTracking: boolean;
  toggleTracking: () => void;
  initializeLocationMarker: () => void;
  initializeGestureWatch: () => void;
  cleanup: () => void;
}

export function useLocationTracking({
  map,
}: UseLocationTrackingOptions): UseLocationTrackingReturn {
  const locationMarker = useRef<mapboxgl.Marker | null>(null);
  const watchId = useRef<number | null>(null);
  const locationWatch = useRef<NodeJS.Timeout | undefined>(undefined);
  const [isTracking, setIsTracking] = useState(false);

  const initializeLocationMarker = useCallback(() => {
    const gpsOptions = {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 5000,
    };

    const id = navigator.geolocation.watchPosition(
      (position) => {
        if (!map.current) {
          return;
        }

        if (!locationMarker.current) {
          locationMarker.current = createLocationMarker(
            position.coords.longitude,
            position.coords.latitude,
          );
          locationMarker.current.addTo(map.current);
        } else {
          locationMarker.current.setLngLat({
            lng: position.coords.longitude,
            lat: position.coords.latitude,
          });
        }
      },
      () => {
        if (locationMarker.current) {
          locationMarker.current.remove();
          locationMarker.current = null;
        }
      },
      gpsOptions,
    );

    watchId.current = id;
  }, [map]);

  const initializeGestureWatch = useCallback(() => {
    if (!map.current) {
      return;
    }

    const disableTracking = () => {
      setIsTracking(false);
      if (locationWatch.current) {
        clearInterval(locationWatch.current);
        locationWatch.current = undefined;
      }
    };

    map.current.on('dragstart', disableTracking);
  }, [map]);

  const setLocationWatch = useCallback(
    (value: boolean) => {
      setIsTracking(value);

      if (value) {
        // When enabled: immediately center on current location
        if (map.current && locationMarker.current) {
          const lngLat = locationMarker.current.getLngLat();
          map.current.flyTo({
            center: [lngLat.lng, lngLat.lat],
            essential: true,
            duration: 1000,
          });
        }

        // Continuously re-center using jumpTo (no animation) so the map is
        // never mid-flight, which would block route-layer tap events.
        locationWatch.current = setInterval(() => {
          if (!map.current || !locationMarker.current) {
            return;
          }

          const lngLat = locationMarker.current.getLngLat();
          map.current.jumpTo({
            center: [lngLat.lng, lngLat.lat],
          });
        }, 1000);
      } else {
        // When disabled: stop tracking
        if (locationWatch.current) {
          clearInterval(locationWatch.current);
          locationWatch.current = undefined;
        }
      }
    },
    [map],
  );

  const toggleTracking = useCallback(() => {
    setLocationWatch(!isTracking);
  }, [isTracking, setLocationWatch]);

  const cleanup = useCallback(() => {
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }

    if (locationWatch.current) {
      clearInterval(locationWatch.current);
      locationWatch.current = undefined;
    }

    if (locationMarker.current) {
      locationMarker.current.remove();
      locationMarker.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  return {
    isTracking,
    toggleTracking,
    initializeLocationMarker,
    initializeGestureWatch,
    cleanup,
  };
}

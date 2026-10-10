import type {
  GeolocationService,
  PositionError,
  PositionFix,
  PositionOptions,
} from '../types';

// Looked up per call, not captured: tests swap navigator.geolocation between
// cases, and a page can lose the API (permissions policy) after load.
function geolocation(): Geolocation | undefined {
  return typeof navigator !== 'undefined' ? navigator.geolocation : undefined;
}

function toFix(position: GeolocationPosition): PositionFix {
  const { coords } = position;
  return {
    lng: coords.longitude,
    lat: coords.latitude,
    accuracy: coords.accuracy,
    altitude: coords.altitude,
    altitudeAccuracy: coords.altitudeAccuracy,
    speed: coords.speed,
    heading: coords.heading,
    timestamp: position.timestamp,
  };
}

function toError(error: GeolocationPositionError): PositionError {
  switch (error.code) {
    case 1:
      return { code: 'permission-denied', message: error.message };
    case 3:
      return { code: 'timeout', message: error.message };
    default:
      return { code: 'unavailable', message: error.message };
  }
}

function toDomOptions(
  options: PositionOptions = {},
): globalThis.PositionOptions {
  return {
    enableHighAccuracy: options.highAccuracy ?? true,
    maximumAge: options.maximumAgeMs ?? 0,
    timeout: options.timeoutMs ?? 5_000,
  };
}

const UNAVAILABLE: PositionError = {
  code: 'unavailable',
  message: 'Geolocation is not available in this browser',
};

export function createWebGeolocation(): GeolocationService {
  return {
    isSupported: () => Boolean(geolocation()),

    watchPosition(onFix, onError, options) {
      const api = geolocation();
      if (!api) {
        onError(UNAVAILABLE);
        return () => {};
      }
      const watchId = api.watchPosition(
        (position) => onFix(toFix(position)),
        (error) => onError(toError(error)),
        toDomOptions(options),
      );
      return () => api.clearWatch(watchId);
    },

    getCurrentPosition(options) {
      const api = geolocation();
      if (!api) return Promise.reject(UNAVAILABLE);
      return new Promise((resolve, reject) => {
        api.getCurrentPosition(
          (position) => resolve(toFix(position)),
          (error) => reject(toError(error)),
          toDomOptions(options),
        );
      });
    },
  };
}

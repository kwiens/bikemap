/**
 * Device capabilities the map depends on, behind interfaces.
 *
 * In a browser these wrap the Web APIs (navigator.geolocation, the Screen Wake
 * Lock API, DeviceOrientationEvent). Inside the Expo shell the same interfaces
 * are fulfilled by the native side — background location, expo-keep-awake,
 * the device compass — without the map code knowing which it has. Nothing
 * outside src/platform may touch those Web APIs directly.
 */

export type Unsubscribe = () => void;

/** A GPS fix in the app's own shape: no DOM GeolocationPosition leaks past
 *  the platform layer. Units are metres, metres per second and degrees. */
export interface PositionFix {
  lng: number;
  lat: number;
  /** Horizontal accuracy radius. */
  accuracy: number;
  altitude: number | null;
  altitudeAccuracy: number | null;
  speed: number | null;
  /** Course over ground, 0–360 clockwise from north. */
  heading: number | null;
  /** Unix ms. */
  timestamp: number;
}

export type PositionErrorCode = 'permission-denied' | 'unavailable' | 'timeout';

export interface PositionError {
  code: PositionErrorCode;
  message: string;
}

export interface PositionOptions {
  /** Prefer the GPS radio over network positioning. */
  highAccuracy?: boolean;
  /** Accept a cached fix no older than this. */
  maximumAgeMs?: number;
  /** Give up on a single fix after this long. */
  timeoutMs?: number;
}

export interface GeolocationService {
  isSupported(): boolean;
  watchPosition(
    onFix: (fix: PositionFix) => void,
    onError: (error: PositionError) => void,
    options?: PositionOptions,
  ): Unsubscribe;
  /** Rejects with a PositionError. */
  getCurrentPosition(options?: PositionOptions): Promise<PositionFix>;
}

/**
 * One position stream shared by everything that wants fixes. The first
 * subscriber starts the underlying watch, the last one stops it, so the
 * location marker and the ride recorder never run two GPS watches at once.
 */
export interface PositionWatch {
  subscribe(
    onFix: (fix: PositionFix) => void,
    onError?: (error: PositionError) => void,
  ): Unsubscribe;
  /** The most recent fix from the watch, if it has produced one. */
  latest(): PositionFix | null;
  /**
   * Ask for a single fix outside the stream — a cached coarse one to paint
   * the dot on a cold start, or a nudge to the hardware after the app comes
   * back from the background. It is returned, not broadcast: a cached fix
   * must never become a ride track point.
   */
  requestFix(options?: PositionOptions): Promise<PositionFix>;
}

export interface KeepAwakeService {
  isSupported(): boolean;
  /**
   * Keep the screen on until the returned function is called. Holders are
   * counted, so tracking and recording can each hold it and the screen is
   * released only when the last one lets go.
   */
  acquire(): Unsubscribe;
}

export interface HeadingService {
  isSupported(): boolean;
  /**
   * Some platforms (iOS Safari) gate the compass behind a prompt that must be
   * triggered from a user gesture. Resolves true when readings may follow.
   */
  requestPermission(): Promise<boolean>;
  /** Raw magnetic heading in degrees, 0–360 clockwise from north. */
  watchHeading(onHeading: (headingDegrees: number) => void): Unsubscribe;
}

export interface PlatformServices {
  /** Which side fulfils the services. UI may differ (e.g. no install prompt
   *  inside the native shell). */
  kind: 'web' | 'native';
  geolocation: GeolocationService;
  positions: PositionWatch;
  keepAwake: KeepAwakeService;
  heading: HeadingService;
}

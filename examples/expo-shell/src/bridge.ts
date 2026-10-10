/**
 * The host side of the bridge: turns page commands into Expo module calls
 * and sends the results back as page events.
 *
 * Everything the host touches is injected through `BridgeDeps`, so this file
 * has no Expo imports and can be unit-tested with fakes. `BikeMapWebView.tsx`
 * supplies the real modules.
 */

import type {
  HostCommand,
  PageEvent,
  PositionError,
  PositionFix,
  PositionOptions,
} from './protocol';

export interface LocationLike {
  coords: {
    longitude: number;
    latitude: number;
    accuracy: number | null;
    altitude: number | null;
    altitudeAccuracy: number | null;
    speed: number | null;
    heading: number | null;
  };
  timestamp: number;
}

export interface Subscription {
  remove(): void;
}

/** The subset of Expo APIs the host needs, in the shape of the real ones. */
export interface BridgeDeps {
  location: {
    requestForegroundPermissionsAsync(): Promise<{ granted: boolean }>;
    requestBackgroundPermissionsAsync(): Promise<{ granted: boolean }>;
    watchPositionAsync(
      options: { accuracy: number; timeInterval?: number; distanceInterval?: number },
      onFix: (location: LocationLike) => void,
    ): Promise<Subscription>;
    getCurrentPositionAsync(options: { accuracy: number }): Promise<LocationLike>;
    getLastKnownPositionAsync(options: {
      maxAge?: number;
    }): Promise<LocationLike | null>;
    watchHeadingAsync(
      onHeading: (heading: { magHeading: number }) => void,
    ): Promise<Subscription>;
    /** `Location.Accuracy` values. */
    Accuracy: { BestForNavigation: number; Balanced: number };
  };
  keepAwake: {
    activateKeepAwakeAsync(tag: string): Promise<void>;
    deactivateKeepAwake(tag: string): Promise<void> | void;
  };
  share: {
    /** Write `content` to a file and open the share sheet for it. Resolves
     *  false if the sheet was dismissed or sharing is unavailable. */
    shareFile(filename: string, mimeType: string, content: string): Promise<boolean>;
    shareLink(url: string): Promise<boolean>;
  };
  /** Deliver an event to the page (`injectJavaScript` in the real host). */
  send(event: PageEvent): void;
}

const KEEP_AWAKE_TAG = 'bikemap';

function toFix(location: LocationLike): PositionFix {
  const { coords } = location;
  return {
    lng: coords.longitude,
    lat: coords.latitude,
    // Expo reports -1 or null for unknown accuracy; the page needs a number.
    accuracy:
      coords.accuracy !== null && coords.accuracy >= 0 ? coords.accuracy : 50,
    altitude: coords.altitude,
    altitudeAccuracy:
      coords.altitudeAccuracy !== null && coords.altitudeAccuracy >= 0
        ? coords.altitudeAccuracy
        : null,
    speed: coords.speed !== null && coords.speed >= 0 ? coords.speed : null,
    heading: coords.heading !== null && coords.heading >= 0 ? coords.heading : null,
    timestamp: location.timestamp,
  };
}

function toError(error: unknown): PositionError {
  const message = error instanceof Error ? error.message : String(error);
  return { code: 'unavailable', message };
}

export interface BridgeHost {
  /** Feed one `onMessage` payload from the WebView. */
  handle(raw: HostCommand): Promise<void>;
  /** Stop every watch and release the screen; call on unmount. */
  dispose(): Promise<void>;
}

export function createBridgeHost(deps: BridgeDeps): BridgeHost {
  const watches = new Map<number, Subscription>();
  let heading: Subscription | null = null;
  let foregroundGranted: boolean | null = null;
  let backgroundRequested = false;

  async function ensureForegroundPermission(): Promise<boolean> {
    if (foregroundGranted === null) {
      foregroundGranted = (
        await deps.location.requestForegroundPermissionsAsync()
      ).granted;
    }
    return foregroundGranted;
  }

  // Background permission lets a ride keep recording with the screen off.
  // It is asked for once, the first time the page wants a high-accuracy
  // watch (the recorder's setting); a refusal still leaves foreground
  // tracking working.
  async function requestBackgroundPermission(): Promise<void> {
    if (backgroundRequested) return;
    backgroundRequested = true;
    try {
      await deps.location.requestBackgroundPermissionsAsync();
    } catch {
      // Not fatal: the watch runs in the foreground only.
    }
  }

  const denied: PositionError = {
    code: 'permission-denied',
    message: 'Location permission was not granted',
  };

  async function startWatch(watchId: number, options: PositionOptions) {
    if (!(await ensureForegroundPermission())) {
      deps.send({ type: 'geolocation/error', watchId, error: denied });
      return;
    }
    if (options.highAccuracy !== false) await requestBackgroundPermission();
    try {
      const subscription = await deps.location.watchPositionAsync(
        {
          accuracy:
            options.highAccuracy === false
              ? deps.location.Accuracy.Balanced
              : deps.location.Accuracy.BestForNavigation,
          timeInterval: 1000,
          distanceInterval: 1,
        },
        (location) => {
          // The page may have cleared the watch while we were starting.
          if (!watches.has(watchId)) return;
          deps.send({ type: 'geolocation/fix', watchId, fix: toFix(location) });
        },
      );
      // Cleared before the subscription came back.
      if (!watches.has(watchId)) {
        subscription.remove();
        return;
      }
      watches.set(watchId, subscription);
    } catch (error) {
      watches.delete(watchId);
      deps.send({ type: 'geolocation/error', watchId, error: toError(error) });
    }
  }

  async function getCurrent(requestId: number, options: PositionOptions) {
    if (!(await ensureForegroundPermission())) {
      deps.send({ type: 'geolocation/currentError', requestId, error: denied });
      return;
    }
    try {
      // A cached fix is what the page asks for on a cold start: answer from
      // the last known position when one is fresh enough.
      if (options.maximumAgeMs && options.maximumAgeMs > 0) {
        const last = await deps.location.getLastKnownPositionAsync({
          maxAge: options.maximumAgeMs,
        });
        if (last) {
          deps.send({ type: 'geolocation/current', requestId, fix: toFix(last) });
          return;
        }
      }
      const location = await deps.location.getCurrentPositionAsync({
        accuracy:
          options.highAccuracy === false
            ? deps.location.Accuracy.Balanced
            : deps.location.Accuracy.BestForNavigation,
      });
      deps.send({ type: 'geolocation/current', requestId, fix: toFix(location) });
    } catch (error) {
      deps.send({
        type: 'geolocation/currentError',
        requestId,
        error: toError(error),
      });
    }
  }

  async function handle(command: HostCommand): Promise<void> {
    switch (command.type) {
      case 'geolocation/watch':
        // Registered before the async start so a clearWatch that arrives
        // first is honoured.
        watches.set(command.watchId, { remove() {} });
        await startWatch(command.watchId, command.options);
        return;
      case 'geolocation/clearWatch':
        watches.get(command.watchId)?.remove();
        watches.delete(command.watchId);
        return;
      case 'geolocation/getCurrent':
        await getCurrent(command.requestId, command.options);
        return;
      case 'keepAwake/acquire':
        await deps.keepAwake.activateKeepAwakeAsync(KEEP_AWAKE_TAG);
        return;
      case 'keepAwake/release':
        await deps.keepAwake.deactivateKeepAwake(KEEP_AWAKE_TAG);
        return;
      case 'heading/requestPermission':
        deps.send({
          type: 'heading/permission',
          requestId: command.requestId,
          granted: await ensureForegroundPermission(),
        });
        return;
      case 'heading/watch':
        if (heading) return;
        heading = await deps.location.watchHeadingAsync(({ magHeading }) => {
          if (magHeading >= 0) {
            deps.send({ type: 'heading/reading', headingDegrees: magHeading });
          }
        });
        return;
      case 'heading/clearWatch':
        heading?.remove();
        heading = null;
        return;
      case 'share/file': {
        let ok = false;
        try {
          ok = await deps.share.shareFile(
            command.filename,
            command.mimeType,
            command.content,
          );
        } catch {
          ok = false;
        }
        deps.send({ type: 'share/result', requestId: command.requestId, ok });
        return;
      }
      case 'share/link': {
        let ok = false;
        try {
          ok = await deps.share.shareLink(command.url);
        } catch {
          ok = false;
        }
        deps.send({ type: 'share/result', requestId: command.requestId, ok });
        return;
      }
    }
  }

  async function dispose(): Promise<void> {
    for (const subscription of watches.values()) subscription.remove();
    watches.clear();
    heading?.remove();
    heading = null;
    await deps.keepAwake.deactivateKeepAwake(KEEP_AWAKE_TAG);
  }

  return { handle, dispose };
}

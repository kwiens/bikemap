import { createPositionWatch } from '../position-watch';
import type {
  GeolocationService,
  HeadingService,
  KeepAwakeService,
  PlatformServices,
  PositionError,
  PositionFix,
  Unsubscribe,
} from '../types';
import { createWebPlatform } from '../web';
import type { NativeHostInfo } from './protocol';
import {
  type BridgeTransport,
  createReactNativeWebViewTransport,
} from './transport';

// Responses that never arrive (host crash, dropped message) must not hang a
// caller forever; a timeout surfaces as the same error the Web API would give.
const RESPONSE_TIMEOUT_MS = 10_000;
// A one-off fix is given the GPS timeout the caller asked for plus the bridge
// round trip, so a host that answers right at its own deadline still counts.
const BRIDGE_SLACK_MS = 2_000;

function createNativeGeolocation(
  transport: BridgeTransport,
): GeolocationService {
  let nextWatchId = 1;
  let nextRequestId = 1;

  return {
    isSupported: () => true,

    watchPosition(onFix, onError, options = {}) {
      const watchId = nextWatchId++;
      const stop = transport.onEvent((event) => {
        if (event.type === 'geolocation/fix' && event.watchId === watchId) {
          onFix(event.fix);
        } else if (
          event.type === 'geolocation/error' &&
          event.watchId === watchId
        ) {
          onError(event.error);
        }
      });
      transport.send({ type: 'geolocation/watch', watchId, options });
      return () => {
        stop();
        transport.send({ type: 'geolocation/clearWatch', watchId });
      };
    },

    getCurrentPosition(options = {}) {
      const requestId = nextRequestId++;
      return new Promise<PositionFix>((resolve, reject) => {
        let stop: Unsubscribe = () => {};
        const timer = setTimeout(
          () => {
            stop();
            const error: PositionError = {
              code: 'timeout',
              message: 'The native host did not answer in time',
            };
            reject(error);
          },
          options.timeoutMs !== undefined
            ? options.timeoutMs + BRIDGE_SLACK_MS
            : RESPONSE_TIMEOUT_MS,
        );
        stop = transport.onEvent((event) => {
          if (
            event.type === 'geolocation/current' &&
            event.requestId === requestId
          ) {
            clearTimeout(timer);
            stop();
            resolve(event.fix);
          } else if (
            event.type === 'geolocation/currentError' &&
            event.requestId === requestId
          ) {
            clearTimeout(timer);
            stop();
            reject(event.error);
          }
        });
        transport.send({ type: 'geolocation/getCurrent', requestId, options });
      });
    },
  };
}

function createNativeKeepAwake(transport: BridgeTransport): KeepAwakeService {
  let holders = 0;
  return {
    isSupported: () => true,
    acquire() {
      holders += 1;
      if (holders === 1) transport.send({ type: 'keepAwake/acquire' });
      let released = false;
      return () => {
        if (released) return;
        released = true;
        holders -= 1;
        if (holders === 0) transport.send({ type: 'keepAwake/release' });
      };
    },
  };
}

function createNativeHeading(transport: BridgeTransport): HeadingService {
  let nextRequestId = 1;
  let watchers = 0;
  return {
    isSupported: () => true,

    requestPermission() {
      const requestId = nextRequestId++;
      return new Promise<boolean>((resolve) => {
        let stop: Unsubscribe = () => {};
        const timer = setTimeout(() => {
          stop();
          resolve(false);
        }, RESPONSE_TIMEOUT_MS);
        stop = transport.onEvent((event) => {
          if (
            event.type === 'heading/permission' &&
            event.requestId === requestId
          ) {
            clearTimeout(timer);
            stop();
            resolve(event.granted);
          }
        });
        transport.send({ type: 'heading/requestPermission', requestId });
      });
    },

    watchHeading(onHeading) {
      const stop = transport.onEvent((event) => {
        if (event.type === 'heading/reading') onHeading(event.headingDegrees);
      });
      watchers += 1;
      if (watchers === 1) transport.send({ type: 'heading/watch' });
      let stopped = false;
      return () => {
        if (stopped) return;
        stopped = true;
        stop();
        watchers -= 1;
        if (watchers === 0) transport.send({ type: 'heading/clearWatch' });
      };
    },
  };
}

/**
 * Services fulfilled by the native host over the bridge. A capability the
 * host does not claim keeps the browser implementation, so a shell that only
 * provides background location still gets the Web Wake Lock and compass.
 */
export function createNativePlatform(
  host: NativeHostInfo,
  transport: BridgeTransport = createReactNativeWebViewTransport(),
): PlatformServices {
  const web = createWebPlatform();
  const geolocation = host.capabilities.geolocation
    ? createNativeGeolocation(transport)
    : web.geolocation;
  return {
    kind: 'native',
    geolocation,
    positions: createPositionWatch(geolocation),
    keepAwake: host.capabilities.keepAwake
      ? createNativeKeepAwake(transport)
      : web.keepAwake,
    heading: host.capabilities.heading
      ? createNativeHeading(transport)
      : web.heading,
  };
}

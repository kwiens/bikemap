import { createPositionWatch } from '../position-watch';
import type {
  GeolocationService,
  HeadingService,
  KeepAwakeService,
  PlatformServices,
  PositionError,
  PositionFix,
  ShareOutcome,
  ShareService,
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
      try {
        transport.send({ type: 'geolocation/watch', watchId, options });
      } catch {
        stop();
        onError({
          code: 'unavailable',
          message: 'The native host could not start GPS.',
        });
        return () => {};
      }
      return () => {
        stop();
        try {
          transport.send({ type: 'geolocation/clearWatch', watchId });
        } catch {
          // The local watch is already detached when the host goes away.
        }
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
        try {
          transport.send({
            type: 'geolocation/getCurrent',
            requestId,
            options,
          });
        } catch {
          clearTimeout(timer);
          stop();
          reject({
            code: 'unavailable',
            message: 'The native host could not request a GPS fix.',
          } satisfies PositionError);
        }
      });
    },
  };
}

function createNativeKeepAwake(transport: BridgeTransport): KeepAwakeService {
  let holders = 0;
  return {
    isSupported: () => true,
    acquire() {
      if (holders === 0) {
        try {
          transport.send({ type: 'keepAwake/acquire' });
        } catch {
          return () => {};
        }
      }
      holders += 1;
      let isReleased = false;
      return () => {
        if (isReleased) return;
        isReleased = true;
        holders -= 1;
        if (holders === 0) {
          try {
            transport.send({ type: 'keepAwake/release' });
          } catch {
            // The next holder can acquire a new lock.
          }
        }
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
        try {
          transport.send({ type: 'heading/requestPermission', requestId });
        } catch {
          clearTimeout(timer);
          stop();
          resolve(false);
        }
      });
    },

    watchHeading(onHeading) {
      const stop = transport.onEvent((event) => {
        if (event.type === 'heading/reading') onHeading(event.headingDegrees);
      });
      if (watchers === 0) {
        try {
          transport.send({ type: 'heading/watch' });
        } catch {
          stop();
          return () => {};
        }
      }
      watchers += 1;
      let isStopped = false;
      return () => {
        if (isStopped) return;
        isStopped = true;
        stop();
        watchers -= 1;
        if (watchers === 0) {
          try {
            transport.send({ type: 'heading/clearWatch' });
          } catch {
            // The local listener has already been removed.
          }
        }
      };
    },
  };
}

function createNativeShare(transport: BridgeTransport): ShareService {
  let nextRequestId = 1;

  // A share sheet stays open as long as the rider likes, so there is no
  // timeout: the promise settles when the host reports back.
  function awaitResult(
    requestId: number,
    send: () => void,
  ): Promise<ShareOutcome> {
    return new Promise((resolve) => {
      const stop = transport.onEvent((event) => {
        if (event.type === 'share/result' && event.requestId === requestId) {
          stop();
          resolve(event.ok ? 'shared' : 'failed');
        }
      });
      try {
        send();
      } catch {
        stop();
        resolve('failed');
      }
    });
  }

  return {
    isSupported: () => true,
    exportFile({ filename, mimeType, content }) {
      const requestId = nextRequestId++;
      return awaitResult(requestId, () =>
        transport.send({
          type: 'share/file',
          requestId,
          filename,
          mimeType,
          content,
        }),
      );
    },
    shareLink(url) {
      const requestId = nextRequestId++;
      return awaitResult(requestId, () =>
        transport.send({ type: 'share/link', requestId, url }),
      );
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
    share: host.capabilities.share ? createNativeShare(transport) : web.share,
  };
}

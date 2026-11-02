import type {
  GeolocationService,
  PositionError,
  PositionFix,
  PositionOptions,
  PositionWatch,
  Unsubscribe,
} from './types';

/** What both the location marker and the ride recorder asked for before they
 *  shared a watch: fresh, GPS-grade fixes. */
export const LIVE_FIX_OPTIONS: Required<PositionOptions> = {
  highAccuracy: true,
  maximumAgeMs: 0,
  timeoutMs: 5_000,
};

interface Subscriber {
  onFix: (fix: PositionFix) => void;
  onError?: (error: PositionError, isFatal: boolean) => void;
}

/**
 * Whether a position error ends the stream. A denied permission always does:
 * browsers stop the watch for good. `unavailable` before the first fix means
 * there is no location provider at all; after a fix it is a transient loss
 * of signal (iOS reports one under a bridge or in a tunnel) and the platform
 * keeps the watch running, so tearing it down would end a ride over a few
 * seconds without a fix. A timeout never does.
 */
export function isFatalPositionError(
  error: PositionError,
  hasHadFix: boolean,
): boolean {
  if (error.code === 'permission-denied') return true;
  return error.code === 'unavailable' && !hasHadFix;
}

export function createPositionWatch(
  geolocation: GeolocationService,
  options: PositionOptions = LIVE_FIX_OPTIONS,
): PositionWatch {
  const subscribers = new Set<Subscriber>();
  let stopWatch: Unsubscribe | null = null;

  // Bumped on every start and stop. A browser can still deliver a callback
  // for a watch that has been cleared (one already queued, or a provider
  // that fires late), and a fatal error's fan-out can unsubscribe and
  // re-subscribe synchronously. Without the generation check either one
  // reaches the current subscribers or stops the hardware they now own.
  let generation = 0;

  function stop() {
    generation += 1;
    stopWatch?.();
    stopWatch = null;
  }

  function start() {
    const startedGeneration = ++generation;
    const isCurrent = () => startedGeneration === generation;
    let hasHadFix = false;
    // A provider may fail synchronously, inside watchPosition, before it has
    // handed back its stop function. Note that and discard the handle.
    let hasDiedWhileStarting = false;
    let isStarting = true;
    const handle = geolocation.watchPosition(
      (fix) => {
        if (!isCurrent()) return;
        hasHadFix = true;
        for (const subscriber of subscribers) subscriber.onFix(fix);
      },
      (error) => {
        if (!isCurrent()) return;
        const isFatal = isFatalPositionError(error, hasHadFix);
        for (const subscriber of subscribers) {
          subscriber.onError?.(error, isFatal);
        }
        if (!isFatal) return;
        // Drop the dead watch so the next subscriber starts the hardware
        // afresh instead of joining a stream that will never speak again.
        if (isStarting) {
          hasDiedWhileStarting = true;
          generation += 1;
        } else if (isCurrent()) {
          stop();
        }
      },
      options,
    );
    isStarting = false;
    if (hasDiedWhileStarting) {
      handle();
    } else {
      stopWatch = handle;
    }
  }

  return {
    subscribe(onFix, onError) {
      const subscriber: Subscriber = { onFix, onError };
      subscribers.add(subscriber);
      if (!stopWatch) start();
      let isActive = true;
      return () => {
        if (!isActive) return;
        isActive = false;
        subscribers.delete(subscriber);
        if (subscribers.size === 0) stop();
      };
    },
    requestFix: (fixOptions) => geolocation.getCurrentPosition(fixOptions),
  };
}

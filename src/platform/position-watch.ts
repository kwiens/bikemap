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
  let activeWatch: { stop?: Unsubscribe } | null = null;

  function stop() {
    const watch = activeWatch;
    activeWatch = null;
    watch?.stop?.();
  }

  function start() {
    const watch: NonNullable<typeof activeWatch> = {};
    activeWatch = watch;
    let hasHadFix = false;
    const handle = geolocation.watchPosition(
      (fix) => {
        if (activeWatch !== watch) return;
        hasHadFix = true;
        for (const subscriber of [...subscribers]) {
          if (activeWatch !== watch) break;
          if (subscribers.has(subscriber)) subscriber.onFix(fix);
        }
      },
      (error) => {
        if (activeWatch !== watch) return;
        const isFatal = isFatalPositionError(error, hasHadFix);
        const recipients = [...subscribers];
        // A subscriber can restart the watch in its error callback. Stop
        // this watch first and deliver the error only to its original listeners.
        if (isFatal) stop();
        for (const subscriber of recipients) {
          if (subscribers.has(subscriber)) subscriber.onError?.(error, isFatal);
        }
      },
      options,
    );
    if (activeWatch === watch) watch.stop = handle;
    else handle();
  }

  return {
    subscribe(onFix, onError) {
      const subscriber: Subscriber = { onFix, onError };
      subscribers.add(subscriber);
      if (!activeWatch) start();
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

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
  onError?: (error: PositionError) => void;
}

export function createPositionWatch(
  geolocation: GeolocationService,
  options: PositionOptions = LIVE_FIX_OPTIONS,
): PositionWatch {
  const subscribers = new Set<Subscriber>();
  let stopWatch: Unsubscribe | null = null;
  let latest: PositionFix | null = null;

  function stop() {
    stopWatch?.();
    stopWatch = null;
    latest = null;
  }

  function start() {
    // A provider may fail synchronously, inside watchPosition, before it has
    // handed back its stop function. Note that and discard the handle.
    let diedWhileStarting = false;
    let starting = true;
    const handle = geolocation.watchPosition(
      (fix) => {
        latest = fix;
        for (const subscriber of subscribers) subscriber.onFix(fix);
      },
      (error) => {
        for (const subscriber of subscribers) subscriber.onError?.(error);
        // Browsers end the underlying watch for good after a denied
        // permission or a lost provider. Drop ours too, so the next
        // subscriber starts the hardware afresh instead of joining a stream
        // that will never speak again.
        if (error.code === 'timeout') return;
        if (starting) diedWhileStarting = true;
        else stop();
      },
      options,
    );
    starting = false;
    if (diedWhileStarting) {
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
      let active = true;
      return () => {
        if (!active) return;
        active = false;
        subscribers.delete(subscriber);
        if (subscribers.size === 0) stop();
      };
    },
    latest: () => latest,
    requestFix: (fixOptions) => geolocation.getCurrentPosition(fixOptions),
  };
}

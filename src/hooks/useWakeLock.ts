'use client';

import { useEffect, useRef } from 'react';

/**
 * Manages a Screen Wake Lock that stays active while `active` is true.
 * Automatically re-acquires when the page returns from background
 * (Android/iOS release the lock when the app is backgrounded).
 */
export function useWakeLock(active: boolean) {
  const lockRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (!active || !navigator.wakeLock) return;

    let cancelled = false;
    let reacquireTimer: ReturnType<typeof setTimeout> | null = null;
    let releaseListener: {
      lock: WakeLockSentinel;
      handleRelease: () => void;
    } | null = null;

    function acquire() {
      if (cancelled) return;
      // Already holding a valid lock
      if (lockRef.current && !lockRef.current.released) return;

      navigator.wakeLock
        .request('screen')
        .then((lock) => {
          if (cancelled) {
            void lock.release().catch(() => {});
            return;
          }
          lockRef.current = lock;
          const handleRelease = () => {
            releaseListener = null;
            if (lockRef.current === lock) {
              lockRef.current = null;
              // OS may silently release the lock (e.g. Android battery
              // optimization) while the page is still visible — re-acquire
              // after a short delay to avoid rapid retry loops.
              if (!cancelled && document.visibilityState === 'visible') {
                reacquireTimer = setTimeout(acquire, 1000);
              }
            }
          };
          releaseListener = { lock, handleRelease };
          // Removed through releaseListener in the effect cleanup; the rule
          // cannot follow a listener registered inside this promise callback.
          // eslint-disable-next-line @eslint-react/web-api-no-leaked-event-listener
          lock.addEventListener('release', handleRelease, { once: true });
        })
        .catch(() => {});
    }

    function handleVisibility() {
      if (document.visibilityState === 'visible') {
        acquire();
      }
    }

    acquire();
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      cancelled = true;
      if (reacquireTimer) clearTimeout(reacquireTimer);
      document.removeEventListener('visibilitychange', handleVisibility);
      if (releaseListener) {
        releaseListener.lock.removeEventListener(
          'release',
          releaseListener.handleRelease,
        );
        releaseListener = null;
      }
      if (lockRef.current) {
        void lockRef.current.release().catch(() => {});
        lockRef.current = null;
      }
    };
  }, [active]);
}

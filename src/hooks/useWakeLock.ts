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

    function acquire() {
      if (cancelled) return;
      // Already holding a valid lock
      if (lockRef.current && !lockRef.current.released) return;

      navigator.wakeLock
        .request('screen')
        .then((lock) => {
          if (cancelled) {
            lock.release();
            return;
          }
          lockRef.current = lock;
          lock.addEventListener('release', () => {
            if (lockRef.current === lock) {
              lockRef.current = null;
            }
          });
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
      document.removeEventListener('visibilitychange', handleVisibility);
      if (lockRef.current) {
        lockRef.current.release();
        lockRef.current = null;
      }
    };
  }, [active]);
}

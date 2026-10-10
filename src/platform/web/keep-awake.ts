import type { KeepAwakeService, Unsubscribe } from '../types';

// Android (battery optimisation) and iOS release the lock when the page is
// backgrounded, and sometimes while it is still visible. Re-acquiring after a
// short delay avoids a tight retry loop against an OS that keeps saying no.
const REACQUIRE_DELAY_MS = 1_000;

function wakeLockApi(): WakeLock | undefined {
  return typeof navigator !== 'undefined' ? navigator.wakeLock : undefined;
}

export function createWebKeepAwake(): KeepAwakeService {
  let holders = 0;
  let lock: WakeLockSentinel | null = null;
  let reacquireTimer: ReturnType<typeof setTimeout> | null = null;

  async function acquireLock(): Promise<void> {
    if (holders === 0) return;
    if (lock && !lock.released) return;
    const api = wakeLockApi();
    if (!api) return;
    try {
      const next = await api.request('screen');
      if (holders === 0) {
        // Every holder let go while the request was in flight.
        void next.release().catch(() => {});
        return;
      }
      lock = next;
      next.addEventListener(
        'release',
        () => {
          // Our own release() nulls `lock` first, so only an OS-initiated
          // release gets here with the sentinel still current.
          if (lock !== next) return;
          lock = null;
          if (holders > 0 && document.visibilityState === 'visible') {
            reacquireTimer = setTimeout(
              () => void acquireLock(),
              REACQUIRE_DELAY_MS,
            );
          }
        },
        { once: true },
      );
    } catch {
      // Denied (low battery, permissions policy): the ride still records.
    }
  }

  function handleVisibility() {
    if (document.visibilityState === 'visible') void acquireLock();
  }

  function releaseAll() {
    document.removeEventListener('visibilitychange', handleVisibility);
    if (reacquireTimer) {
      clearTimeout(reacquireTimer);
      reacquireTimer = null;
    }
    const current = lock;
    lock = null;
    void current?.release().catch(() => {});
  }

  return {
    isSupported: () => Boolean(wakeLockApi()),

    acquire(): Unsubscribe {
      if (!wakeLockApi()) return () => {};
      holders += 1;
      if (holders === 1) {
        document.addEventListener('visibilitychange', handleVisibility);
        void acquireLock();
      }
      let released = false;
      return () => {
        if (released) return;
        released = true;
        holders -= 1;
        if (holders === 0) releaseAll();
      };
    },
  };
}

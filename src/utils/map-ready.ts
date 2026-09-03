// The map-ready handshake.
//
// `Map.tsx` initializes Mapbox asynchronously, so listeners that want to act
// "once the map exists" race against it: an effect that registers before
// initialization must wait for MAP_READY, while one that registers after it
// has already missed the event. A window flag closes that gap.
//
// The flag is deliberately reset on teardown — it describes the *current*
// map instance, and a stale `true` would make listeners on a remounted tree
// (React Strict Mode's double-mount, Fast Refresh) fire against a map that no
// longer exists, having skipped the MAP_READY listener that would have
// recovered them.

import { MAP_EVENTS } from '@/events';

const READY_FLAG = '__mapReady';

function flags(): Record<string, boolean | undefined> {
  return window as unknown as Record<string, boolean | undefined>;
}

/** True once the current map instance has finished initializing. */
export function isMapReady(): boolean {
  return typeof window !== 'undefined' && flags()[READY_FLAG] === true;
}

/** Called by Map.tsx when the map is initialized: sets the flag, then fires. */
export function setMapReady(): void {
  flags()[READY_FLAG] = true;
  window.dispatchEvent(new Event(MAP_EVENTS.MAP_READY));
}

/** Called by Map.tsx on teardown so a remount can't see a stale flag. */
export function clearMapReady(): void {
  if (typeof window === 'undefined') return;
  delete flags()[READY_FLAG];
}

/**
 * Run `callback` once the map is ready — immediately if it already is.
 * Returns an unsubscribe function suitable for returning from a useEffect.
 */
export function onMapReady(callback: () => void): () => void {
  if (isMapReady()) {
    callback();
    return () => {};
  }
  window.addEventListener(MAP_EVENTS.MAP_READY, callback, { once: true });
  return () => window.removeEventListener(MAP_EVENTS.MAP_READY, callback);
}

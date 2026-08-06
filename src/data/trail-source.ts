/**
 * The trail list the app renders, and where it comes from.
 *
 * Trails are authored in Payload and read on the server (see
 * `src/payload/read/trails.ts`), then handed to the client by
 * `TrailDataProvider`, which calls `setMountainBikeTrails` before anything
 * renders.
 *
 * Until that happens — and permanently for anyone running without a database —
 * this falls back to the checked-in arrays in `src/data/cities/*`. That
 * fallback is deliberate: the public map keeps working with no database, which
 * is what makes the fork-and-deploy story hold.
 *
 * Consumers must call `getMountainBikeTrails()` rather than importing an array,
 * because a `const` binding would capture the checked-in data at import time
 * and never see the database rows.
 */
import { activeCityData } from './cities';
import type { MountainBikeTrail } from './mountain-bike-trails';

let trails: MountainBikeTrail[] = activeCityData.mountainBikeTrails;
let usingDatabase = false;

/** Notified when the source changes, so derived lookups can be rebuilt. */
const subscribers = new Set<() => void>();

export function getMountainBikeTrails(): MountainBikeTrail[] {
  return trails;
}

/** True once the server has supplied rows from Payload. */
export function isUsingDatabaseTrails(): boolean {
  return usingDatabase;
}

/**
 * Replaces the trail list. Called once per page load, during render, before
 * any consumer reads — so no re-render is needed and the value is stable for
 * the life of the session.
 *
 * An empty list is ignored: an empty database should leave the checked-in data
 * in place rather than blank the map.
 */
export function setMountainBikeTrails(next: MountainBikeTrail[]): void {
  if (next.length === 0 || next === trails) {
    return;
  }
  trails = next;
  usingDatabase = true;
  for (const notify of subscribers) {
    notify();
  }
}

/** Registers a callback to invalidate anything derived from the trail list. */
export function onMountainBikeTrailsChange(notify: () => void): () => void {
  subscribers.add(notify);
  return () => subscribers.delete(notify);
}

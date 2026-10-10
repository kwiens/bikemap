/**
 * The trail list the app renders, and where it comes from.
 *
 * Trails are authored in Payload and read on the server (see
 * `src/payload/read/trails.ts`), then handed to the client as part of
 * `CityContent` and published here by `publishCityContent` before anything
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
import { createContentStore } from './content-store';
import type { MountainBikeTrail } from './mountain-bike-trails';

export const trailStore = createContentStore<MountainBikeTrail>(
  activeCityData.mountainBikeTrails,
);

export function getMountainBikeTrails(): MountainBikeTrail[] {
  return trailStore.get();
}

/** True once the server has supplied rows from Payload. */
export function isUsingDatabaseTrails(): boolean {
  return trailStore.isFromDatabase();
}

/**
 * Replaces the trail list. An empty list is ignored: an empty database should
 * leave the checked-in data in place rather than blank the map.
 */
export function setMountainBikeTrails(next: MountainBikeTrail[]): void {
  trailStore.set(next);
}

/** Registers a callback to invalidate anything derived from the trail list. */
export function onMountainBikeTrailsChange(notify: () => void): () => void {
  return trailStore.subscribe(notify);
}

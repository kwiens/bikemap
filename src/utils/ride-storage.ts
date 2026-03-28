// localStorage CRUD for recorded rides
// Each ride is stored individually to avoid per-value size limits.

import type { RecordedRide, RideSummary } from '../data/ride';
import { RIDES_INDEX_KEY, rideStorageKey } from '../data/ride';

function readIndex(): string[] {
  const raw = localStorage.getItem(RIDES_INDEX_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
}

function writeIndex(ids: string[]): void {
  localStorage.setItem(RIDES_INDEX_KEY, JSON.stringify(ids));
}

export function saveRide(ride: RecordedRide): void {
  const ids = readIndex();
  if (!ids.includes(ride.id)) {
    ids.unshift(ride.id); // newest first
    writeIndex(ids);
  }
  localStorage.setItem(rideStorageKey(ride.id), JSON.stringify(ride));
}

export function loadRide(id: string): RecordedRide | null {
  const raw = localStorage.getItem(rideStorageKey(id));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as RecordedRide;
  } catch {
    return null;
  }
}

export function loadAllRides(): RecordedRide[] {
  const ids = readIndex();
  const rides: RecordedRide[] = [];
  for (const id of ids) {
    const ride = loadRide(id);
    if (ride) rides.push(ride);
  }
  return rides.sort((a, b) => b.startTime - a.startTime);
}

export function deleteRide(id: string): void {
  localStorage.removeItem(rideStorageKey(id));
  const ids = readIndex().filter((i) => i !== id);
  writeIndex(ids);
}

export function renameRide(id: string, newName: string): void {
  const ride = loadRide(id);
  if (!ride) return;
  ride.name = newName;
  localStorage.setItem(rideStorageKey(id), JSON.stringify(ride));
}

export function getRideSummaries(): RideSummary[] {
  const ids = readIndex();
  const summaries: RideSummary[] = [];
  for (const id of ids) {
    const raw = localStorage.getItem(rideStorageKey(id));
    if (!raw) continue;
    try {
      const ride = JSON.parse(raw) as RecordedRide;
      summaries.push({
        id: ride.id,
        name: ride.name,
        startTime: ride.startTime,
        stats: ride.stats,
      });
    } catch {
      // skip corrupted entries
    }
  }
  return summaries.sort((a, b) => b.startTime - a.startTime);
}

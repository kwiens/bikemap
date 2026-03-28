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

export async function getStorageUsage(): Promise<{
  usedKB: number;
  totalKB: number;
}> {
  // Use Storage API for accurate quota when available
  if (navigator.storage?.estimate) {
    const est = await navigator.storage.estimate();
    if (est.usage !== undefined && est.quota !== undefined) {
      return {
        usedKB: Math.round(est.usage / 1024),
        totalKB: Math.round(est.quota / 1024),
      };
    }
  }

  // Fallback: measure localStorage directly
  let usedBytes = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key) {
      usedBytes += key.length;
      const val = localStorage.getItem(key);
      if (val) usedBytes += val.length;
    }
  }
  // Most browsers allow 5-10MB; use 10MB as default
  return { usedKB: Math.round(usedBytes / 1024), totalKB: 10240 };
}

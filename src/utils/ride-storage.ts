// IndexedDB storage for recorded rides
// Migrates existing localStorage rides on first open.

import type { RecordedRide, RideSummary } from '../data/ride';
import { RIDES_INDEX_KEY, rideStorageKey } from '../data/ride';

const DB_NAME = 'bike-chatt-rides';
const DB_VERSION = 1;
const STORE_NAME = 'rides';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('startTime', 'startTime');
      }
    };

    req.onsuccess = () => {
      const db = req.result;
      migrateFromLocalStorage(db).then(() => resolve(db));
    };

    req.onerror = () => reject(req.error);
  });
}

// One-time migration from localStorage to IndexedDB
async function migrateFromLocalStorage(db: IDBDatabase): Promise<void> {
  const indexRaw = localStorage.getItem(RIDES_INDEX_KEY);
  if (!indexRaw) return;

  let ids: string[];
  try {
    ids = JSON.parse(indexRaw) as string[];
  } catch {
    return;
  }

  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);

  for (const id of ids) {
    const raw = localStorage.getItem(rideStorageKey(id));
    if (!raw) continue;
    try {
      const ride = JSON.parse(raw) as RecordedRide;
      store.put(ride);
      localStorage.removeItem(rideStorageKey(id));
    } catch {
      // skip corrupted entries
    }
  }

  localStorage.removeItem(RIDES_INDEX_KEY);

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function idbRequest<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbTransaction(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function saveRide(ride: RecordedRide): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  tx.objectStore(STORE_NAME).put(ride);
  await idbTransaction(tx);
}

export async function loadRide(id: string): Promise<RecordedRide | null> {
  const db = await openDB();
  const result = await idbRequest(
    db.transaction(STORE_NAME).objectStore(STORE_NAME).get(id),
  );
  return (result as RecordedRide) ?? null;
}

export async function loadAllRides(): Promise<RecordedRide[]> {
  const db = await openDB();
  const rides = (await idbRequest(
    db.transaction(STORE_NAME).objectStore(STORE_NAME).getAll(),
  )) as RecordedRide[];
  return rides.sort((a, b) => b.startTime - a.startTime);
}

export async function deleteRide(id: string): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  tx.objectStore(STORE_NAME).delete(id);
  await idbTransaction(tx);
}

export async function renameRide(id: string, newName: string): Promise<void> {
  const ride = await loadRide(id);
  if (!ride) return;
  ride.name = newName;
  await saveRide(ride);
}

export async function getRideSummaries(): Promise<RideSummary[]> {
  const db = await openDB();
  const rides = (await idbRequest(
    db.transaction(STORE_NAME).objectStore(STORE_NAME).getAll(),
  )) as RecordedRide[];
  return rides
    .map((ride) => ({
      id: ride.id,
      name: ride.name,
      startTime: ride.startTime,
      stats: ride.stats,
    }))
    .sort((a, b) => b.startTime - a.startTime);
}

export async function getStorageUsage(): Promise<{
  usedKB: number;
  totalKB: number;
}> {
  if (navigator.storage?.estimate) {
    const est = await navigator.storage.estimate();
    if (est.usage !== undefined && est.quota !== undefined) {
      return {
        usedKB: Math.round(est.usage / 1024),
        totalKB: Math.round(est.quota / 1024),
      };
    }
  }
  return { usedKB: 0, totalKB: 0 };
}

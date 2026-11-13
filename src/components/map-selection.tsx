'use client';

import {
  createContext,
  useContext,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import type { ElevationProfile } from '@/data/mountain-bike-trails';
import type { RecordedRide } from '@/data/ride';

type OsmSelection = {
  kind: 'osm';
  lines: [number, number][][];
  profile: ElevationProfile | null;
};

export type MapSelection =
  | { kind: 'route'; routeId: string }
  | { kind: 'trail'; trailName: string; autoDetected?: boolean }
  | { kind: 'area'; areaName: string }
  | OsmSelection
  | { kind: 'ride'; rideId: string; ride: RecordedRide | null }
  | null;

/** The active selection is shared by the map and its UI for one page mount. */
export function MapSelectionProvider({ children }: { children: ReactNode }) {
  const [store] = useState(createMapSelection);
  return (
    <MapSelectionContext.Provider value={store}>
      {children}
    </MapSelectionContext.Provider>
  );
}

export function useMapSelectionStore() {
  const store = useContext(MapSelectionContext);
  if (!store) throw new Error('MapSelectionProvider is missing');
  return store;
}

export function useMapSelection(): MapSelection {
  const { subscribe, get } = useMapSelectionStore();
  return useSyncExternalStore(subscribe, get, emptySelection);
}

function emptySelection(): MapSelection {
  return null;
}

function createMapSelection() {
  let current: MapSelection = null;
  const listeners = new Set<() => void>();

  function set(selection: MapSelection) {
    if (selection === current) return;
    current = selection;
    for (const listener of listeners) listener();
  }

  return {
    get: () => current,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    select(selection: Exclude<MapSelection, OsmSelection | { kind: 'ride' }>) {
      set(selection);
    },
    async selectRide(rideId: string) {
      const pending = { kind: 'ride', rideId, ride: null } as const;
      set(pending);
      try {
        const { loadRide } = await import('@/utils/ride-storage');
        if (current !== pending) return;
        const ride = await loadRide(rideId);
        if (current === pending) set(ride ? { ...pending, ride } : null);
      } catch (error) {
        if (current === pending) set(null);
        console.error('Failed to load ride:', error);
      }
    },
    async selectOsmTrail(
      lines: OsmSelection['lines'],
      loadProfile: () => Promise<ElevationProfile | null>,
    ) {
      const pending = { kind: 'osm', lines, profile: null } as const;
      set(pending);
      const profile = await Promise.resolve()
        .then(loadProfile)
        .catch(() => null);
      if (profile && current === pending) set({ ...pending, profile });
    },
  };
}

const MapSelectionContext = createContext<ReturnType<
  typeof createMapSelection
> | null>(null);

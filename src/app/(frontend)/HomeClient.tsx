'use client';

import type { ReactElement } from 'react';
import dynamic from 'next/dynamic';
import React, { useEffect } from 'react';
import { PwaInstallPrompt } from '@/components/PwaInstallPrompt';
import { WelcomeModal } from '@/components/WelcomeModal';
import { bikeRoutes } from '@/data/geo_data';
import type { MountainBikeTrail } from '@/data/mountain-bike-trails';
import { slugForTrail } from '@/data/mountain-bike-trails';
import {
  getMountainBikeTrails,
  setMountainBikeTrails,
} from '@/data/trail-source';
import { slugify } from '@/utils/string';
import { MAP_EVENTS } from '@/events';

// Dynamically import the Map component with no SSR since Mapbox requires window
const BikeMap = dynamic(() => import('@/components/Map'), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 flex items-center justify-center bg-gray-100">
      Loading map...
    </div>
  ),
});

export default function HomeClient({
  trails,
}: {
  /** Trails read from Payload on the server. Empty means "use the checked-in
   *  data", which is what happens with no database configured. */
  trails: MountainBikeTrail[];
}): ReactElement {
  // Publish the server's trails into the module store *during render*, before
  // the map or sidebar read them. They don't change for the life of the page,
  // so this needs no state and triggers no re-render.
  setMountainBikeTrails(trails);

  // On mount, check URL for shared trail/route link and auto-select
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const trailSlug = params.get('trail');
    const routeSlug = params.get('route');

    if (!trailSlug && !routeSlug) return;

    const selectFromUrl = () => {
      if (trailSlug) {
        const found = getMountainBikeTrails().find(
          (t) => slugForTrail(t) === trailSlug,
        );
        if (found) {
          window.dispatchEvent(
            new CustomEvent(MAP_EVENTS.TRAIL_SELECT, {
              detail: { trailName: found.trailName },
            }),
          );
        }
      } else if (routeSlug) {
        const found = bikeRoutes.find((r) => slugify(r.name) === routeSlug);
        if (found) {
          window.dispatchEvent(
            new CustomEvent(MAP_EVENTS.ROUTE_SELECT, {
              detail: { routeId: found.id },
            }),
          );
        }
      }
    };

    // If the map already initialized before this effect ran, select now.
    // Otherwise wait for the MAP_READY event.
    if ((window as unknown as Record<string, boolean>).__mapReady) {
      selectFromUrl();
      return;
    }
    window.addEventListener(MAP_EVENTS.MAP_READY, selectFromUrl, {
      once: true,
    });
    return () =>
      window.removeEventListener(MAP_EVENTS.MAP_READY, selectFromUrl);
  }, []);

  return (
    <main className="overflow-hidden fixed inset-0 m-0 p-0">
      <BikeMap />
      <PwaInstallPrompt />
      <WelcomeModal />
    </main>
  );
}

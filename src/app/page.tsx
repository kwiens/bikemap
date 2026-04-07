'use client';

import type { ReactElement } from 'react';
import dynamic from 'next/dynamic';
import React, { useEffect } from 'react';
import { PwaInstallPrompt } from '@/components/PwaInstallPrompt';
import { WelcomeModal } from '@/components/WelcomeModal';
import { mountainBikeTrails, bikeRoutes } from '@/data/geo_data';
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

export default function Home(): ReactElement {
  // On mount, check URL for shared trail/route link and auto-select
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const trailSlug = params.get('trail');
    const routeSlug = params.get('route');

    if (!trailSlug && !routeSlug) return;

    const selectFromUrl = () => {
      if (trailSlug) {
        const found = mountainBikeTrails.find(
          (t) => slugify(t.trailName) === trailSlug,
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

    // Wait for the map to be fully initialized before selecting
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

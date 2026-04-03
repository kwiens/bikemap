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
    <div className="w-full h-dvh flex items-center justify-center bg-gray-100">
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

    if (trailSlug) {
      const found = mountainBikeTrails.find(
        (t) => slugify(t.trailName) === trailSlug,
      );
      if (found) {
        // Delay to let the map initialize
        setTimeout(() => {
          window.dispatchEvent(
            new CustomEvent(MAP_EVENTS.TRAIL_SELECT, {
              detail: { trailName: found.trailName },
            }),
          );
        }, 2000);
      }
    } else if (routeSlug) {
      const found = bikeRoutes.find((r) => slugify(r.name) === routeSlug);
      if (found) {
        setTimeout(() => {
          window.dispatchEvent(
            new CustomEvent(MAP_EVENTS.ROUTE_SELECT, {
              detail: { routeId: found.id },
            }),
          );
        }, 2000);
      }
    }
  }, []);

  return (
    <main className="w-screen h-dvh overflow-hidden absolute inset-0 m-0 p-0">
      <BikeMap />
      <PwaInstallPrompt />
      <WelcomeModal />
    </main>
  );
}

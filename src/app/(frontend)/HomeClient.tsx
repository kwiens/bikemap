'use client';

import type { ReactElement } from 'react';
import dynamic from 'next/dynamic';
import React from 'react';
import { PwaInstallPrompt } from '@/components/PwaInstallPrompt';
import { WelcomeModal } from '@/components/WelcomeModal';
import { activeCityId } from '@/config/map.config';
import type { CityId } from '@/data/cities/types';
import type { MountainBikeTrail } from '@/data/mountain-bike-trails';
import { setMountainBikeTrails } from '@/data/trail-source';
import { useUrlDeepLink } from '@/hooks/useUrlDeepLink';

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
  cityId,
  trails,
}: {
  /** The city the server resolved from the request host. */
  cityId: CityId;
  /** Trails read from Payload on the server. Empty means "use the checked-in
   *  data", which is what happens with no database configured. */
  trails: MountainBikeTrail[];
}): ReactElement {
  // Publish the server's trails into the module store *during render*, before
  // the map or sidebar read them. They don't change for the life of the page,
  // so this needs no state and triggers no re-render.
  //
  // Server and browser resolve the city independently — the server from the
  // request host, this module from `window.location`. A response served for
  // another host must not replace this city's trails, so they have to agree.
  if (cityId === activeCityId) {
    setMountainBikeTrails(trails);
  }

  // On mount, check URL for shared trail/route link and auto-select
  useUrlDeepLink();

  return (
    <main className="overflow-hidden fixed inset-0 m-0 p-0">
      <BikeMap />
      <PwaInstallPrompt />
      <WelcomeModal />
    </main>
  );
}

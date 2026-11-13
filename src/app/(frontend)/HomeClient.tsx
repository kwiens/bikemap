'use client';

import type { ReactElement } from 'react';
import dynamic from 'next/dynamic';
import React from 'react';
import { PwaInstallPrompt } from '@/components/PwaInstallPrompt';
import { WelcomeModal } from '@/components/WelcomeModal';
import { type CityContent, publishCityContent } from '@/data/city-content';
import { MapSelectionProvider } from '@/components/map-selection';
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
  content,
}: {
  /** Everything the server read from Payload for the city it resolved from
   *  the request host. See `publishCityContent` for why it is published
   *  during render and when it is refused. */
  content: CityContent;
}): ReactElement {
  const isActiveCity = publishCityContent(content);
  const attractions = isActiveCity ? (content.attractions ?? []) : [];

  return (
    <main className="overflow-hidden fixed inset-0 m-0 p-0">
      <MapSelectionProvider>
        <HomeMap attractions={attractions} />
      </MapSelectionProvider>
      <PwaInstallPrompt />
      <WelcomeModal />
    </main>
  );
}

function HomeMap({
  attractions,
}: {
  attractions: NonNullable<CityContent['attractions']>;
}) {
  useUrlDeepLink();
  return <BikeMap attractions={attractions} />;
}

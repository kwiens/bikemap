'use client';

import type { ReactElement } from 'react';
import dynamic from 'next/dynamic';
import React from 'react';
import { ConditionReportModal } from '@/components/ConditionReportModal';
import { PwaInstallPrompt } from '@/components/PwaInstallPrompt';
import { TrailConditionsProvider } from '@/components/TrailConditionsProvider';
import { WelcomeModal } from '@/components/WelcomeModal';
import { type CityContent, publishCityContent } from '@/data/city-content';
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
  publishCityContent(content);

  // On mount, check URL for shared trail/route link and auto-select
  useUrlDeepLink();

  return (
    <main className="overflow-hidden fixed inset-0 m-0 p-0">
      {/* Wraps the map so the sidebar's badges and the report form share one
          copy of the conditions, and sits out here rather than inside BikeMap
          because the form is a sibling of the map, like WelcomeModal. */}
      <TrailConditionsProvider>
        <BikeMap />
        <ConditionReportModal />
      </TrailConditionsProvider>
      <PwaInstallPrompt />
      <WelcomeModal />
    </main>
  );
}

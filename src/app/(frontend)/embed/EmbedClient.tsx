'use client';

import type { ReactElement } from 'react';
import dynamic from 'next/dynamic';
import React from 'react';
import { TrailConditionsProvider } from '@/components/TrailConditionsProvider';
import { type CityContent, publishCityContent } from '@/data/city-content';
import type { EmbedMode } from '@/utils/embed';

const EmbedMap = dynamic(() => import('@/components/embed/EmbedMap'), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 flex items-center justify-center bg-gray-100">
      Loading map...
    </div>
  ),
});

export default function EmbedClient({
  content,
  mode,
}: {
  /** Only the content family selected by the embed mode is loaded. */
  content: CityContent;
  mode: EmbedMode;
}): ReactElement {
  publishCityContent(content);

  return (
    <main className="overflow-hidden fixed inset-0 m-0 p-0">
      {/* Trails embeds show conditions and closures, read-only: there is no
          ConditionReportModal, so nothing on a partner's page files a report.
          A routes embed has no trails to badge, so it skips the fetch. */}
      {mode === 'mtb' ? (
        <TrailConditionsProvider>
          <EmbedMap />
        </TrailConditionsProvider>
      ) : (
        <EmbedMap />
      )}
    </main>
  );
}

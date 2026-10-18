'use client';

import type { ReactElement } from 'react';
import dynamic from 'next/dynamic';
import React from 'react';
import { type CityContent, publishCityContent } from '@/data/city-content';
import { FeatureSettingsProvider } from '@/components/FeatureSettingsContext';
import {
  DEFAULT_FEATURE_SETTINGS,
  type FeatureSettings,
} from '@/config/features.config';

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
  settings = DEFAULT_FEATURE_SETTINGS,
}: {
  /** Only the content family selected by the embed mode is loaded. */
  content: CityContent;
  settings?: FeatureSettings;
}): ReactElement {
  publishCityContent(content);

  return (
    <FeatureSettingsProvider settings={settings}>
      <main className="overflow-hidden fixed inset-0 m-0 p-0">
        <EmbedMap />
      </main>
    </FeatureSettingsProvider>
  );
}

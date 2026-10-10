'use client';

import type { ReactElement } from 'react';
import dynamic from 'next/dynamic';
import React from 'react';
import { type CityContent, publishCityContent } from '@/data/city-content';

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
}: {
  /** Routes only: embeds are Casual-only and never attach the trail layers. */
  content: CityContent;
}): ReactElement {
  publishCityContent(content);

  return (
    <main className="overflow-hidden fixed inset-0 m-0 p-0">
      <EmbedMap />
    </main>
  );
}

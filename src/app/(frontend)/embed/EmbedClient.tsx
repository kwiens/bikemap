'use client';

import type { ReactElement } from 'react';
import dynamic from 'next/dynamic';
import React from 'react';
import { activeCityId } from '@/config/map.config';
import type { BikeRoute } from '@/data/bike-routes';
import type { CityId } from '@/data/cities/types';
import { setBikeRoutes } from '@/data/route-source';

const EmbedMap = dynamic(() => import('@/components/embed/EmbedMap'), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 flex items-center justify-center bg-gray-100">
      Loading map...
    </div>
  ),
});

export default function EmbedClient({
  cityId,
  routes,
}: {
  cityId: CityId;
  routes: BikeRoute[];
}): ReactElement {
  if (cityId === activeCityId) {
    setBikeRoutes(routes);
  }

  return (
    <main className="overflow-hidden fixed inset-0 m-0 p-0">
      <EmbedMap />
    </main>
  );
}

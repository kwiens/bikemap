'use client';

import { useState } from 'react';
import type { MapFeature } from '@/data/map-features';
import BikeMap from '@/components/Map';
import { MapSelectionProvider } from '@/components/map-selection';
import { EmbedProvider } from '@/components/EmbedContext';
import { parseEmbedOptions, type EmbedOptions } from '@/utils/embed';
import { useUrlDeepLink } from '@/hooks/useUrlDeepLink';

// Only ever rendered client-side (the /embed page imports it with
// `next/dynamic({ ssr: false })`), so reading `window.location.search`
// directly here is safe.
export default function EmbedMap({
  attractions,
}: {
  attractions: MapFeature[];
}) {
  const [options] = useState(() => parseEmbedOptions(window.location.search));

  return (
    <EmbedProvider options={options}>
      <MapSelectionProvider>
        <EmbedMapContent attractions={attractions} options={options} />
      </MapSelectionProvider>
    </EmbedProvider>
  );
}

function EmbedMapContent({
  attractions,
  options,
}: {
  attractions: MapFeature[];
  options: EmbedOptions;
}) {
  // Use the already-decoded selection for the chosen route family so query
  // parsing has one source of truth and an irrelevant route/trail parameter
  // cannot select hidden content.
  useUrlDeepLink({
    routes: options.mode === 'casual',
    trails: options.mode === 'mtb',
    route: options.route,
    trail: options.trail,
  });

  return <BikeMap attractions={attractions} />;
}

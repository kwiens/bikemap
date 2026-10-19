'use client';

import { useState } from 'react';
import BikeMap from '@/components/Map';
import { EmbedProvider } from '@/components/EmbedContext';
import { parseEmbedOptions } from '@/utils/embed';
import { useUrlDeepLink } from '@/hooks/useUrlDeepLink';

// Only ever rendered client-side (the /embed page imports it with
// `next/dynamic({ ssr: false })`), so reading `window.location.search`
// directly here is safe.
export default function EmbedMap() {
  const [options] = useState(() => parseEmbedOptions(window.location.search));

  // Use the already-decoded selection for the chosen route family so query
  // parsing has one source of truth and an irrelevant route/trail parameter
  // cannot select hidden content.
  useUrlDeepLink({
    routes: options.mode === 'casual',
    trails: options.mode === 'mtb',
    route: options.route,
    trail: options.trail,
  });

  return (
    <EmbedProvider options={options}>
      <BikeMap />
    </EmbedProvider>
  );
}

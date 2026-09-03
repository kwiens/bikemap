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

  // Embed mode is Casual-only — there's no trails layer to deep-link into.
  // The route slug comes from the options we already decoded, so `?route=` has
  // a single decoder rather than two that can disagree about trimming.
  useUrlDeepLink({ trails: false, route: options.route });

  return (
    <EmbedProvider options={options}>
      <BikeMap />
    </EmbedProvider>
  );
}

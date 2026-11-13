import type { ReactElement } from 'react';
import React from 'react';
import { resolveActiveCityId } from '@/config/map.config';
import { getCityAttractions } from '@/payload/read/attractions';
import { getCityRoutes } from '@/payload/read/routes';
import { getCityTrailSummaries } from '@/payload/read/trails';
import { parseEmbedMode } from '@/utils/embed';
import { getRequestHostname } from '@/utils/request-hostname';
import EmbedClient from './EmbedClient';

export default async function EmbedPage({
  searchParams,
}: {
  searchParams: Promise<{ city?: string | string[]; mode?: string | string[] }>;
}): Promise<ReactElement> {
  const [hostname, query] = await Promise.all([
    getRequestHostname(),
    searchParams,
  ]);
  const cityId = resolveActiveCityId(hostname, query.city);
  const mode = parseEmbedMode(query.mode);
  // Only the list the client publishes: the readers also return status and,
  // for routes, every route's GeoJSON, which would otherwise ride along in every
  // embed's RSC payload.
  if (mode === 'mtb') {
    const { trails } = await getCityTrailSummaries(cityId);
    return <EmbedClient content={{ cityId, trails }} />;
  }

  const [{ routes }, attractions] = await Promise.all([
    getCityRoutes(cityId),
    getCityAttractions(cityId),
  ]);
  const content = { cityId, routes, attractions };
  return <EmbedClient content={content} />;
}

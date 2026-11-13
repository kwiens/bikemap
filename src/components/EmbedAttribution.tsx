'use client';

import { useState } from 'react';
import { getMountainBikeTrails } from '@/data/trail-source';
import { slugForTrail } from '@/data/mountain-bike-trails';
import { getBikeRoutes } from '@/data/route-source';
import { routeFromLink } from '@/data/bike-routes';
import { MAP_EVENTS } from '@/events';
import { useMapEvent } from '@/hooks/useMapEvent';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowUpRightFromSquare } from '@fortawesome/free-solid-svg-icons';
import { useEmbed } from '@/components/EmbedContext';
import { siteConfig } from '@/config/site.config';
import { cityIdForQuery } from '@/config/map.config';

// Small "open the real site" pill shown only inside `/embed` — third-party
// hosts frame the map via <iframe>, so this is the only way a viewer gets to
// the full app (route sharing, ride recording, etc). Renders nothing outside
// embed mode.
export function EmbedAttribution() {
  const { isEmbed, options } = useEmbed();

  const isMtb = options.mode === 'mtb';
  const [slug, setSlug] = useState(() =>
    isMtb
      ? getMountainBikeTrails().some(
          (trail) => slugForTrail(trail) === options.trail,
        )
        ? options.trail
        : undefined
      : routeFromLink(getBikeRoutes(), options.route)?.id,
  );

  useMapEvent(MAP_EVENTS.TRAIL_SELECT, ({ trailName }) => {
    if (!isEmbed || !isMtb) return;
    const trail = getMountainBikeTrails().find(
      (item) => item.trailName === trailName,
    );
    setSlug(trail ? slugForTrail(trail) : undefined);
  });
  useMapEvent(MAP_EVENTS.ROUTE_SELECT, ({ routeId }) => {
    if (!isEmbed || isMtb) return;
    setSlug(getBikeRoutes().find((route) => route.id === routeId)?.id);
  });
  useMapEvent(MAP_EVENTS.TRAIL_DESELECT, () => {
    if (isEmbed && isMtb) setSlug(undefined);
  });
  useMapEvent(MAP_EVENTS.ROUTE_DESELECT, () => {
    if (isEmbed && !isMtb) setSlug(undefined);
  });

  if (!isEmbed) return null;

  const url = new URL(siteConfig.url);
  if (slug) url.searchParams.set(isMtb ? 'trail' : 'route', slug);
  const city = cityIdForQuery(
    new URLSearchParams(window.location.search).get('city'),
  );
  if (city) url.searchParams.set('city', city);
  const href = url.search ? url.toString() : siteConfig.url;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      // Top-right corner. The space above Mapbox's NavigationControl is free —
      // `map.css` pins that stack to `top: calc(68px + safe-area)` — so this
      // sits above it rather than below, and stays on screen even in a short
      // frame (a partner using height:200px), where a fixed lower offset would
      // have pushed the viewer's only route to the full site out of view.
      // Both bottom corners are unusable in embed mode anyway: Mapbox's own
      // attribution control sits bottom-right, the location-tracker button at
      // `bottom-[60px] right-4`, and the elevation panel spans nearly the full
      // width along the bottom whenever a route is selected.
      className="absolute top-3 right-3 z-1000 flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-[0_2px_4px_rgba(0,0,0,0.2)] hover:text-gray-900"
    >
      Open in {siteConfig.name}
      <FontAwesomeIcon
        icon={faArrowUpRightFromSquare}
        className="w-2.5 h-2.5"
      />
    </a>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { getMountainBikeTrails } from '@/data/trail-source';
import { slugForTrail } from '@/data/mountain-bike-trails';
import { getBikeRoutes } from '@/data/route-source';
import { MAP_EVENTS } from '@/events';
import { slugify } from '@/utils/string';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowUpRightFromSquare } from '@fortawesome/free-solid-svg-icons';
import { useEmbed } from '@/components/EmbedContext';
import { siteConfig } from '@/config/site.config';

// Small "open the real site" pill shown only inside `/embed` — third-party
// hosts frame the map via <iframe>, so this is the only way a viewer gets to
// the full app (route sharing, ride recording, etc). Renders nothing outside
// embed mode.
export function EmbedAttribution() {
  const { isEmbed, options } = useEmbed();

  const [selection, setSelection] = useState(() => {
    const slug = options.mode === 'mtb' ? options.trail : options.route;
    return slug
      ? `${options.mode === 'mtb' ? 'trail' : 'route'}=${encodeURIComponent(slug)}`
      : '';
  });

  useEffect(() => {
    if (!isEmbed) return;
    const selectEvent =
      options.mode === 'mtb'
        ? MAP_EVENTS.TRAIL_SELECT
        : MAP_EVENTS.ROUTE_SELECT;
    const deselectEvent =
      options.mode === 'mtb'
        ? MAP_EVENTS.TRAIL_DESELECT
        : MAP_EVENTS.ROUTE_DESELECT;
    function handleSelect(event: Event) {
      if (options.mode === 'mtb') {
        const { trailName } = (event as CustomEvent<{ trailName: string }>)
          .detail;
        const trail = getMountainBikeTrails().find(
          (item) => item.trailName === trailName,
        );
        setSelection(
          `trail=${encodeURIComponent(trail ? slugForTrail(trail) : slugify(trailName))}`,
        );
      } else {
        const { routeId } = (event as CustomEvent<{ routeId: string }>).detail;
        const route = getBikeRoutes().find((item) => item.id === routeId);
        setSelection(
          route ? `route=${encodeURIComponent(slugify(route.name))}` : '',
        );
      }
    }
    function handleDeselect() {
      setSelection('');
    }
    window.addEventListener(selectEvent, handleSelect);
    window.addEventListener(deselectEvent, handleDeselect);
    return () => {
      window.removeEventListener(selectEvent, handleSelect);
      window.removeEventListener(deselectEvent, handleDeselect);
    };
  }, [isEmbed, options.mode]);

  if (!isEmbed) return null;

  const href = selection ? `${siteConfig.url}?${selection}` : siteConfig.url;

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
      className="absolute top-3 right-3 z-[1000] flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-[0_2px_4px_rgba(0,0,0,0.2)] hover:text-gray-900"
    >
      Open in {siteConfig.name}
      <FontAwesomeIcon
        icon={faArrowUpRightFromSquare}
        className="w-2.5 h-2.5"
      />
    </a>
  );
}

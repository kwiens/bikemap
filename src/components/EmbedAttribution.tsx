'use client';

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

  if (!isEmbed) return null;

  const href = options.route
    ? `${siteConfig.url}?route=${encodeURIComponent(options.route)}`
    : siteConfig.url;

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

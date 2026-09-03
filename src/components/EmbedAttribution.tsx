'use client';

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowUpRightFromSquare } from '@fortawesome/free-solid-svg-icons';
import { useEmbed } from '@/components/EmbedContext';
import { siteConfig } from '@/config/site.config';
import { cn } from '@/lib/utils';

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
      // Anchored top-right, below Mapbox's NavigationControl (which
      // `map.css` pins to `top: calc(68px + safe-area)`, extending to
      // roughly 176px for its 3-button zoom/compass stack). This clears
      // both bottom corners entirely, which are already crowded in embed
      // mode: Mapbox's own (unrepositioned) bottom-right attribution
      // control, the location-tracker button (`bottom-[60px] right-4` in
      // Map.tsx), and the elevation panel, which spans nearly the full
      // width along the bottom (`bottom-4`/`bottom-[60px]` with `left-4`
      // or `left-2 right-2`) whenever a route/trail is selected.
      className={cn(
        'absolute right-3 z-[1000] flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-[0_2px_4px_rgba(0,0,0,0.2)] hover:text-gray-900',
        // Below the Mapbox nav-control stack on a normal-height embed. A fixed
        // top offset would push it off-screen in a short frame (a partner
        // using height:200px), and this is the viewer's only route to the full
        // site — so drop back to the top on anything under ~260px tall.
        'top-2 [@media(min-height:260px)]:top-[184px]',
      )}
    >
      Open in {siteConfig.name}
      <FontAwesomeIcon
        icon={faArrowUpRightFromSquare}
        className="w-2.5 h-2.5"
      />
    </a>
  );
}

'use client';

import { useEffect, useRef, useState, type ReactElement } from 'react';
import { bikeRoutes } from '@/data/geo_data';
import { slugify } from '@/utils/string';
import {
  MARKER_LAYERS,
  buildEmbedSearch,
  parseCenter,
  type EmbedLayer,
  type EmbedOptions,
} from '@/utils/embed';
import { cn } from '@/lib/utils';

const IFRAME_ALLOW =
  'geolocation; fullscreen; gyroscope; accelerometer; magnetometer';
const IFRAME_STYLE =
  'width:100%; aspect-ratio: 4/3; border:0; border-radius: 12px';

/** How long to wait after the last edit before navigating the preview iframe.
 *  Each navigation is a full Mapbox map boot (style + tile fetches), so this
 *  keeps rapid typing (e.g. in the zoom field) from firing one per keystroke. */
const PREVIEW_DEBOUNCE_MS = 500;

export interface EmbedSnippetBuilderProps {
  /** Absolute origin used in the copy-paste snippet, e.g. https://bikechatt.com */
  baseUrl: string;
}

export function EmbedSnippetBuilder({
  baseUrl,
}: EmbedSnippetBuilderProps): ReactElement {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [route, setRoute] = useState('');
  const [markerLayer, setMarkerLayer] = useState<EmbedLayer | ''>('');
  const [bikeNetworkOn, setBikeNetworkOn] = useState(false);
  const [zoomInput, setZoomInput] = useState('');
  const [centerInput, setCenterInput] = useState('');
  const [copied, setCopied] = useState(false);

  const centerTrimmed = centerInput.trim();
  // Validated with the embed's own parser, so the form can't accept a value
  // the map would silently drop.
  const center = centerTrimmed === '' ? undefined : parseCenter(centerTrimmed);
  const showCenterError = centerTrimmed !== '' && center === undefined;

  const zoomTrimmed = zoomInput.trim();
  const zoomNumber = zoomTrimmed === '' ? undefined : Number(zoomTrimmed);
  // A transient empty string or a lone "-" parses to undefined/NaN — neither
  // is "finite", so it's treated as mid-edit rather than an invalid value.
  const zoomIsFiniteNumber =
    zoomNumber !== undefined && Number.isFinite(zoomNumber);
  const zoomInRange = zoomIsFiniteNumber && zoomNumber >= 0 && zoomNumber <= 24;
  const showZoomError = zoomIsFiniteNumber && !zoomInRange;

  const layers: EmbedLayer[] = [
    ...(markerLayer ? [markerLayer] : []),
    ...(bikeNetworkOn ? (['bikeNetwork'] as const) : []),
  ];

  const options: Partial<EmbedOptions> = {
    sidebarOpen,
    route: route || undefined,
    center,
    zoom: zoomInRange ? zoomNumber : undefined,
    layers,
  };

  const search = buildEmbedSearch(options);
  const iframeSrc = search ? `/embed?${search}` : '/embed';
  const absoluteSrc = `${baseUrl}${iframeSrc}`;

  const snippet = [
    `<iframe`,
    `  src="${absoluteSrc}"`,
    `  title="Bike map"`,
    `  allow="${IFRAME_ALLOW}"`,
    `  loading="lazy"`,
    `  style="${IFRAME_STYLE}"`,
    `></iframe>`,
  ].join('\n');

  const iframeRef = useRef<HTMLIFrameElement>(null);
  // The element's `src` attribute is only ever set once, on first render —
  // after that the preview navigates itself imperatively (see effect below)
  // so that changing `src` in place doesn't re-mount the iframe (Issue 1).
  const initialIframeSrcRef = useRef(iframeSrc);
  const isFirstRenderRef = useRef(true);

  useEffect(() => {
    if (isFirstRenderRef.current) {
      // The initial src is already applied via the element's `src` attribute.
      isFirstRenderRef.current = false;
      return;
    }
    const timeout = setTimeout(() => {
      const iframe = iframeRef.current;
      if (!iframe) return;
      try {
        // `location.replace` (vs. assigning `src`) doesn't push a history
        // entry on the parent page. Same-origin here, so this should always
        // succeed, but fall back defensively if it doesn't.
        const win = iframe.contentWindow;
        if (!win) throw new Error('iframe has no contentWindow');
        win.location.replace(iframeSrc);
      } catch {
        iframe.src = iframeSrc;
      }
    }, PREVIEW_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [iframeSrc]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable (e.g. insecure context) — silently ignore,
      // the snippet is still selectable/copyable by hand.
    }
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-gray-50 p-6">
      {/* Stacked rather than two columns: the About page caps content at
          max-w-2xl, and a viewport-based `lg:` split would squeeze the preview
          to a couple of hundred pixels there. */}
      <div className="flex flex-col gap-6">
        <div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
              Sidebar
              <select
                className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm"
                value={sidebarOpen ? 'open' : 'closed'}
                onChange={(e) => setSidebarOpen(e.target.value === 'open')}
              >
                <option value="closed">Closed</option>
                <option value="open">Open</option>
              </select>
            </label>

            <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
              Selected route
              <select
                className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm"
                value={route}
                onChange={(e) => setRoute(e.target.value)}
              >
                <option value="">None</option>
                {bikeRoutes.map((r) => (
                  <option key={r.id} value={slugify(r.name)}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
              Zoom
              <input
                type="number"
                min={0}
                max={24}
                step="0.1"
                placeholder="Default"
                className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm"
                value={zoomInput}
                onChange={(e) => setZoomInput(e.target.value)}
                aria-invalid={showZoomError}
              />
              {showZoomError && (
                <span className="text-xs font-normal text-red-600">
                  Zoom must be between 0 and 24
                </span>
              )}
            </label>

            <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
              Center
              <input
                type="text"
                inputMode="decimal"
                placeholder="Longitude, latitude"
                className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm"
                value={centerInput}
                onChange={(e) => setCenterInput(e.target.value)}
                aria-invalid={showCenterError}
              />
              {showCenterError && (
                <span className="text-xs font-normal text-red-600">
                  Use longitude, latitude — e.g. -85.309, 35.046
                </span>
              )}
            </label>
          </div>

          <fieldset className="mt-4">
            <legend className="text-sm font-medium text-gray-700">
              Markers
            </legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="radio"
                  name="marker-layer"
                  checked={markerLayer === ''}
                  onChange={() => setMarkerLayer('')}
                />
                None
              </label>
              {MARKER_LAYERS.map((layer) => (
                <label
                  key={layer}
                  className="flex items-center gap-2 text-sm text-gray-700"
                >
                  <input
                    type="radio"
                    name="marker-layer"
                    checked={markerLayer === layer}
                    onChange={() => setMarkerLayer(layer)}
                  />
                  {LAYER_LABELS[layer]}
                </label>
              ))}
            </div>
          </fieldset>

          <label className="mt-4 flex items-center gap-2 text-sm font-medium text-gray-700">
            <input
              type="checkbox"
              checked={bikeNetworkOn}
              onChange={() => setBikeNetworkOn((prev) => !prev)}
            />
            {LAYER_LABELS.bikeNetwork}
          </label>

          <div className="mt-6">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">
                Snippet to paste
              </span>
              <button
                type="button"
                onClick={handleCopy}
                className={cn(
                  'rounded-md border px-3 py-1 text-xs font-medium transition-colors',
                  copied
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                    : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-100',
                )}
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <pre className="overflow-x-auto rounded-md border border-gray-300 bg-white p-3 text-xs text-gray-800">
              <code>{snippet}</code>
            </pre>
          </div>
        </div>

        <div>
          <span className="mb-1 block text-sm font-medium text-gray-700">
            Live preview
          </span>
          <iframe
            ref={iframeRef}
            src={initialIframeSrcRef.current}
            title="Bike map"
            allow={IFRAME_ALLOW}
            loading="lazy"
            className="aspect-[4/3] w-full rounded-xl border-0"
          />
        </div>
      </div>

      <details className="mt-6 border-t border-gray-200 pt-4 text-sm text-gray-600">
        <summary className="cursor-pointer font-medium text-gray-700">
          Requirements &amp; troubleshooting
        </summary>
        <ul className="mt-3 flex flex-col gap-2 pl-4 list-disc marker:text-gray-400">
          <li>
            Keep the <code className="font-mono">allow</code> attribute — it is
            what lets the &ldquo;locate me&rdquo; button and compass work inside
            a frame. Your page also has to be served over HTTPS for those.
          </li>
          <li>
            Keep a height on the iframe. Without one it collapses to about
            150px; the <code className="font-mono">aspect-ratio</code> above
            handles any width.
          </li>
          <li>
            Test on a page served over http(s), not by opening an HTML file
            directly. A <code className="font-mono">file://</code> page has no
            web address, so browsers block it from framing any site — the{' '}
            <code className="font-mono">frame-ancestors</code> error you get is
            not a problem with your snippet.
          </li>
          <li>
            Please don&rsquo;t cover the © Mapbox / © OpenStreetMap credit in
            the corner of the map — Mapbox&rsquo;s terms require it stay
            visible.
          </li>
        </ul>
      </details>
    </section>
  );
}

const LAYER_LABELS: Record<EmbedLayer, string> = {
  attractions: 'Attractions',
  bikeResources: 'Bike shops & resources',
  bikeRentals: 'Bike rentals',
  bikeNetwork: 'Bike network',
};

'use client';

import { useEffect, useId, useRef, useState, type ReactElement } from 'react';
import {
  buildEmbedSearch,
  parseCenter,
  parseZoom,
  type EmbedLayer,
  type EmbedMode,
  type EmbedOptions,
} from '@/utils/embed';
import type { EmbedBuilderConfig } from '@/utils/embed-options';
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
  /** Routes and layers for the city being served — resolved on the server from
   *  the request hostname, so this works on a multi-domain deployment. */
  config: EmbedBuilderConfig;
}

export function EmbedSnippetBuilder({
  baseUrl,
  config,
}: EmbedSnippetBuilderProps): ReactElement {
  const { cityId, routes, trails, availableLayers } = config;
  const fieldId = useId();
  const markerLayers = availableLayers.filter((l) => l !== 'bikeNetwork');
  const hasBikeNetwork = availableLayers.includes('bikeNetwork');
  const [mode, setMode] = useState<EmbedMode>('casual');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [route, setRoute] = useState('');
  const [trail, setTrail] = useState('');
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
  // Same parser the embed uses, so the form can't accept a zoom the map drops.
  const zoom = zoomTrimmed === '' ? undefined : parseZoom(zoomTrimmed);
  const showZoomError = zoomTrimmed !== '' && zoom === undefined;

  const layers: EmbedLayer[] =
    mode === 'casual'
      ? [
          ...(markerLayer ? [markerLayer] : []),
          ...(bikeNetworkOn ? (['bikeNetwork'] as const) : []),
        ]
      : [];

  const options: Partial<EmbedOptions> = {
    mode,
    sidebarOpen,
    route: mode === 'casual' ? route || undefined : undefined,
    trail: mode === 'mtb' ? trail || undefined : undefined,
    center,
    zoom,
    layers,
  };

  const search = new URLSearchParams(buildEmbedSearch(options));
  search.set('city', cityId);
  const iframeSrc = `/embed?${search.toString()}`;
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
  // What the frame is actually showing, so a debounced edit that lands back on
  // the current URL doesn't re-boot the map for nothing.
  const loadedSrcRef = useRef(iframeSrc);
  // Keep React from navigating the frame before the debounced effect runs.
  const initialSrcRef = useRef(iframeSrc);

  useEffect(() => {
    if (loadedSrcRef.current === iframeSrc) return;

    const timeout = setTimeout(() => {
      const win = iframeRef.current?.contentWindow;
      if (!win) return;
      loadedSrcRef.current = iframeSrc;
      // `location.replace` (vs. assigning `src`) adds no history entry to the
      // parent page. Same-origin, so it cannot throw.
      win.location.replace(iframeSrc);
    }, PREVIEW_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [iframeSrc]);

  const copyResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (copyResetRef.current) clearTimeout(copyResetRef.current);
    },
    [],
  );

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      if (copyResetRef.current) clearTimeout(copyResetRef.current);
      copyResetRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable (e.g. insecure context) — silently ignore,
      // the snippet is still selectable/copyable by hand.
    }
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-gray-50 p-6">
      <div className="flex flex-col gap-6">
        <fieldset>
          <legend className="text-sm font-medium text-gray-700">
            Routes to show
          </legend>
          <div className="mt-2 grid grid-cols-2 gap-2 rounded-lg bg-gray-100 p-1">
            {ROUTE_MODES.map((option) => (
              <label
                key={option.value}
                className={cn(
                  'cursor-pointer rounded-md px-3 py-2 text-center text-sm font-medium transition-colors',
                  mode === option.value
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700',
                )}
              >
                <input
                  type="radio"
                  name={`${fieldId}-route-mode`}
                  value={option.value}
                  checked={mode === option.value}
                  onChange={() => setMode(option.value)}
                  className="sr-only"
                />
                {option.label}
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <span className="mb-1 block text-sm font-medium text-gray-700">
            Live preview
          </span>
          <iframe
            ref={iframeRef}
            src={initialSrcRef.current}
            title="Bike map preview"
            allow={IFRAME_ALLOW}
            className="aspect-[4/3] w-full rounded-xl border-0"
          />
        </div>

        <details className="rounded-lg border border-gray-200 bg-white">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-gray-700">
            Advanced settings
          </summary>
          <div className="border-t border-gray-200 p-4">
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
                {mode === 'mtb' ? 'Selected trail' : 'Selected route'}
                <select
                  className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm"
                  value={mode === 'mtb' ? trail : route}
                  onChange={(e) =>
                    mode === 'mtb'
                      ? setTrail(e.target.value)
                      : setRoute(e.target.value)
                  }
                >
                  <option value="">None</option>
                  {(mode === 'mtb' ? trails : routes).map((item) => (
                    <option key={item.id} value={item.slug}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>

              <div className="flex flex-col gap-1">
                <label
                  htmlFor={`${fieldId}-zoom`}
                  className="text-sm font-medium text-gray-700"
                >
                  Zoom
                </label>
                <input
                  id={`${fieldId}-zoom`}
                  type="number"
                  min={0}
                  max={24}
                  step="0.1"
                  placeholder="Default"
                  className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm"
                  value={zoomInput}
                  onChange={(e) => setZoomInput(e.target.value)}
                  aria-invalid={showZoomError}
                  aria-describedby={
                    showZoomError ? `${fieldId}-zoom-error` : undefined
                  }
                />
                {showZoomError && (
                  <span
                    id={`${fieldId}-zoom-error`}
                    className="text-xs text-red-600"
                  >
                    Zoom must be between 0 and 24
                  </span>
                )}
              </div>

              <div className="flex flex-col gap-1">
                <label
                  htmlFor={`${fieldId}-center`}
                  className="text-sm font-medium text-gray-700"
                >
                  Center
                </label>
                <input
                  id={`${fieldId}-center`}
                  type="text"
                  inputMode="decimal"
                  placeholder="Longitude, latitude"
                  className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm"
                  value={centerInput}
                  onChange={(e) => setCenterInput(e.target.value)}
                  aria-invalid={showCenterError}
                  aria-describedby={
                    showCenterError ? `${fieldId}-center-error` : undefined
                  }
                />
                {showCenterError && (
                  <span
                    id={`${fieldId}-center-error`}
                    className="text-xs text-red-600"
                  >
                    Use longitude, latitude — e.g. -85.309, 35.046
                  </span>
                )}
              </div>
            </div>

            {mode === 'casual' && (
              <>
                <fieldset className="mt-4">
                  <legend className="text-sm font-medium text-gray-700">
                    Markers
                  </legend>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                      <input
                        type="radio"
                        name={`${fieldId}-marker-layer`}
                        checked={markerLayer === ''}
                        onChange={() => setMarkerLayer('')}
                      />
                      None
                    </label>
                    {markerLayers.map((layer) => (
                      <label
                        key={layer}
                        className="flex items-center gap-2 text-sm text-gray-700"
                      >
                        <input
                          type="radio"
                          name={`${fieldId}-marker-layer`}
                          checked={markerLayer === layer}
                          onChange={() => setMarkerLayer(layer)}
                        />
                        {LAYER_LABELS[layer]}
                      </label>
                    ))}
                  </div>
                </fieldset>

                {hasBikeNetwork && (
                  <label className="mt-4 flex items-center gap-2 text-sm font-medium text-gray-700">
                    <input
                      type="checkbox"
                      checked={bikeNetworkOn}
                      onChange={() => setBikeNetworkOn((prev) => !prev)}
                    />
                    {LAYER_LABELS.bikeNetwork}
                  </label>
                )}
              </>
            )}
          </div>
        </details>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">
              Code snippet
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
            If you hand-edit <code className="font-mono">layers</code>, keep at
            most one of the marker layers — the map shows them one at a time, so
            a second one is ignored. The bike-network overlay can accompany any
            of them.
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

const ROUTE_MODES: Array<{ label: string; value: EmbedMode }> = [
  { label: 'Casual routes', value: 'casual' },
  { label: 'MTB routes', value: 'mtb' },
];

const LAYER_LABELS: Record<EmbedLayer, string> = {
  attractions: 'Attractions',
  bikeResources: 'Bike shops & resources',
  bikeRentals: 'Bike rentals',
  bikeNetwork: 'Bike network',
};

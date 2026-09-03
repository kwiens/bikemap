'use client';

import { useMemo, useState, type ReactElement } from 'react';
import { bikeRoutes } from '@/data/geo_data';
import { slugify } from '@/utils/string';
import {
  EMBED_LAYERS,
  buildEmbedSearch,
  type EmbedLayer,
  type EmbedOptions,
} from '@/utils/embed';
import { cn } from '@/lib/utils';

const IFRAME_ALLOW =
  'geolocation; fullscreen; gyroscope; accelerometer; magnetometer';
const IFRAME_STYLE =
  'width:100%; aspect-ratio: 4/3; border:0; border-radius: 12px';

export interface EmbedSnippetBuilderProps {
  /** Absolute origin used in the copy-paste snippet, e.g. https://bikechatt.com */
  baseUrl: string;
}

export function EmbedSnippetBuilder({
  baseUrl,
}: EmbedSnippetBuilderProps): ReactElement {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [route, setRoute] = useState('');
  const [layers, setLayers] = useState<EmbedLayer[]>([]);
  const [zoomInput, setZoomInput] = useState('');
  const [copied, setCopied] = useState(false);

  const options: Partial<EmbedOptions> = useMemo(() => {
    const zoom = zoomInput.trim() === '' ? undefined : Number(zoomInput);
    return {
      sidebarOpen,
      route: route || undefined,
      zoom: zoom !== undefined && Number.isFinite(zoom) ? zoom : undefined,
      layers,
    };
  }, [sidebarOpen, route, zoomInput, layers]);

  const search = useMemo(() => buildEmbedSearch(options), [options]);
  const iframeSrc = search ? `/embed?${search}` : '/embed';
  const absoluteSrc = search
    ? `${baseUrl}/embed?${search}`
    : `${baseUrl}/embed`;

  const snippet = useMemo(
    () =>
      [
        `<iframe`,
        `  src="${absoluteSrc}"`,
        `  title="Bike map"`,
        `  allow="${IFRAME_ALLOW}"`,
        `  loading="lazy"`,
        `  style="${IFRAME_STYLE}"`,
        `></iframe>`,
      ].join('\n'),
    [absoluteSrc],
  );

  function toggleLayer(layer: EmbedLayer) {
    setLayers((prev) =>
      prev.includes(layer) ? prev.filter((l) => l !== layer) : [...prev, layer],
    );
  }

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
      <h2 className="text-lg font-semibold text-gray-900">
        Embed this map on your site
      </h2>
      <p className="mt-1 text-sm text-gray-600">
        Customize the options below, then copy the snippet into your page.
      </p>

      <div className="mt-6 grid gap-8 lg:grid-cols-2">
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
              />
            </label>
          </div>

          <fieldset className="mt-4">
            <legend className="text-sm font-medium text-gray-700">
              Layers on at load
            </legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {EMBED_LAYERS.map((layer) => (
                <label
                  key={layer}
                  className="flex items-center gap-2 text-sm text-gray-700"
                >
                  <input
                    type="checkbox"
                    checked={layers.includes(layer)}
                    onChange={() => toggleLayer(layer)}
                  />
                  {LAYER_LABELS[layer]}
                </label>
              ))}
            </div>
          </fieldset>

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
            key={iframeSrc}
            src={iframeSrc}
            title="Bike map"
            allow={IFRAME_ALLOW}
            loading="lazy"
            className="aspect-[4/3] w-full rounded-xl border-0"
          />
        </div>
      </div>

      <div className="mt-8 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-gray-300 text-gray-500">
              <th className="py-1 pr-4 font-medium">Param</th>
              <th className="py-1 pr-4 font-medium">Values</th>
              <th className="py-1 font-medium">Default</th>
            </tr>
          </thead>
          <tbody className="text-gray-700">
            {PARAM_REFERENCE.map((row) => (
              <tr key={row.param} className="border-b border-gray-100">
                <td className="py-1 pr-4 font-mono text-xs">{row.param}</td>
                <td className="py-1 pr-4">{row.values}</td>
                <td className="py-1">{row.defaultValue}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-gray-500">
        <code className="font-mono">allow=&quot;geolocation&quot;</code> is
        required for the locate-me button to work inside a frame, and the iframe
        needs an explicit height — the{' '}
        <code className="font-mono">aspect-ratio</code> style above provides it.
      </p>
    </section>
  );
}

const LAYER_LABELS: Record<EmbedLayer, string> = {
  attractions: 'Attractions',
  bikeResources: 'Bike shops & resources',
  bikeRentals: 'Bike rentals',
  bikeNetwork: 'Bike network',
};

const PARAM_REFERENCE: {
  param: string;
  values: string;
  defaultValue: string;
}[] = [
  { param: 'sidebar', values: 'open | closed', defaultValue: 'closed' },
  { param: 'route', values: '<slug> (e.g. riverwalk-loop)', defaultValue: '—' },
  { param: 'center', values: '<lng>,<lat>', defaultValue: 'city default' },
  { param: 'zoom', values: '0–24', defaultValue: 'city default' },
  {
    param: 'layers',
    values: 'comma list: attractions, bikeResources, bikeRentals, bikeNetwork',
    defaultValue: 'none',
  },
];

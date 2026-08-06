'use client';

/**
 * Picks the OSM ways a trail rides on, by clicking them on a map.
 *
 * This is the authoring surface for the whole collection: everything geometric
 * is derived from what's selected here (see resolveOsmGeometry). It renders the
 * same nationwide OSM trails tileset the public map uses, so what an editor
 * clicks is exactly what riders see.
 *
 * Deliberately *not* a drawing tool. Trails are already mapped in OSM; picking
 * the ways is both less work and keeps the geometry maintained upstream, where
 * community fixes flow back in for free.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import { useField } from '@payloadcms/ui';
import { mapConfig } from '@/config/map.config';
import {
  OSM_TRAILS_SOURCE_ID,
  OSM_TRAILS_SOURCE_LAYER,
  OSM_TRAILS_TILEJSON_URL,
} from '@/data/osm-trails';
// The same filter the public map uses, so an editor picks from exactly the
// ways riders see rendered.
import { OSM_BIKE_TRAIL_FILTER } from '@/utils/map';

const PICKER_LAYER_ID = 'osm-way-picker';
const PICKER_HIT_LAYER_ID = 'osm-way-picker-hit';
const SELECTED_COLOR = '#2563EB';
const UNSELECTED_COLOR = '#9CA3AF';

interface PickedWay {
  id: number;
  name: string;
}

export function OsmWayPicker({ path }: { path: string }) {
  const { setValue, value } = useField<number[] | string>({ path });
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [ready, setReady] = useState(false);
  const [names, setNames] = useState<Record<number, string>>({});

  // The stored value round-trips through JSON, so it can arrive as a string.
  const ids = useMemo<number[]>(() => {
    const raw = typeof value === 'string' ? safeParse(value) : value;
    return Array.isArray(raw)
      ? raw.map(Number).filter((id) => Number.isInteger(id) && id > 0)
      : [];
  }, [value]);

  // Keep the latest ids readable from the map click handler without
  // re-registering it on every change.
  const idsRef = useRef(ids);
  idsRef.current = ids;

  const toggle = useCallback(
    (id: number, name: string) => {
      const current = idsRef.current;
      // Order is meaningful — it disambiguates trails that double back on
      // themselves — so append rather than sort.
      const next = current.includes(id)
        ? current.filter((existing) => existing !== id)
        : [...current, id];
      setNames((previous) => ({ ...previous, [id]: name }));
      setValue(next);
    },
    [setValue],
  );

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return;
    }
    if (!mapConfig.mapbox.accessToken) {
      return;
    }

    mapboxgl.accessToken = mapConfig.mapbox.accessToken;
    const map = new mapboxgl.Map({
      center: mapConfig.defaultView.center,
      container: containerRef.current,
      style: mapConfig.mapbox.styleUrl,
      zoom: mapConfig.defaultView.zoom,
    });
    mapRef.current = map;

    map.addControl(new mapboxgl.NavigationControl(), 'top-right');

    map.on('load', () => {
      if (!map.getSource(OSM_TRAILS_SOURCE_ID)) {
        map.addSource(OSM_TRAILS_SOURCE_ID, {
          type: 'vector',
          url: OSM_TRAILS_TILEJSON_URL,
        });
      }

      // A wide transparent line makes the ways tappable; singletrack rendered
      // at its true width is far too thin to click reliably.
      map.addLayer({
        id: PICKER_HIT_LAYER_ID,
        filter: OSM_BIKE_TRAIL_FILTER,
        paint: { 'line-color': '#000', 'line-opacity': 0, 'line-width': 18 },
        source: OSM_TRAILS_SOURCE_ID,
        'source-layer': OSM_TRAILS_SOURCE_LAYER,
        type: 'line',
      });

      map.addLayer({
        id: PICKER_LAYER_ID,
        filter: OSM_BIKE_TRAIL_FILTER,
        paint: {
          'line-color': UNSELECTED_COLOR,
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1.5, 16, 4],
        },
        source: OSM_TRAILS_SOURCE_ID,
        'source-layer': OSM_TRAILS_SOURCE_LAYER,
        type: 'line',
      });

      map.on('click', PICKER_HIT_LAYER_ID, (event) => {
        const feature = event.features?.[0];
        const osmId = Number(feature?.properties?.OSM_ID);
        if (!Number.isInteger(osmId) || osmId <= 0) {
          return;
        }
        toggle(osmId, String(feature?.properties?.name ?? `way ${osmId}`));
      });

      map.on('mouseenter', PICKER_HIT_LAYER_ID, () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', PICKER_HIT_LAYER_ID, () => {
        map.getCanvas().style.cursor = '';
      });

      setReady(true);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [toggle]);

  // Repaint the selection whenever the id list changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !map.getLayer(PICKER_LAYER_ID)) {
      return;
    }

    map.setPaintProperty(PICKER_LAYER_ID, 'line-color', [
      'case',
      ['in', ['to-string', ['get', 'OSM_ID']], ['literal', ids.map(String)]],
      SELECTED_COLOR,
      UNSELECTED_COLOR,
    ]);
    map.setPaintProperty(PICKER_LAYER_ID, 'line-width', [
      'case',
      ['in', ['to-string', ['get', 'OSM_ID']], ['literal', ids.map(String)]],
      5,
      ['interpolate', ['linear'], ['zoom'], 10, 1.5, 16, 4],
    ]);
  }, [ids, ready]);

  const picked: PickedWay[] = ids.map((id) => ({
    id,
    name: names[id] ?? `way ${id}`,
  }));

  if (!mapConfig.mapbox.accessToken) {
    return (
      <div className="field-type">
        <p>
          Set <code>NEXT_PUBLIC_MAPBOX_TOKEN</code> to pick trails on the map.
        </p>
      </div>
    );
  }

  return (
    <div className="field-type">
      <label className="field-label" htmlFor={path}>
        OSM ways
      </label>
      <p
        style={{
          color: 'var(--theme-elevation-500)',
          fontSize: '0.8rem',
          margin: '0 0 0.5rem',
        }}
      >
        Click a trail to add it, click again to remove. Order matters for trails
        that double back — pick them in riding order.
      </p>

      <div
        ref={containerRef}
        style={{
          border: '1px solid var(--theme-elevation-150)',
          borderRadius: 4,
          height: 420,
          width: '100%',
        }}
      />

      <div style={{ marginTop: '0.75rem' }}>
        {picked.length === 0 ? (
          <p style={{ color: 'var(--theme-elevation-500)', margin: 0 }}>
            No ways picked yet.
          </p>
        ) : (
          <ol style={{ margin: 0, paddingLeft: '1.25rem' }}>
            {picked.map((way) => (
              <li key={way.id} style={{ marginBottom: '0.25rem' }}>
                {way.name}{' '}
                <a
                  href={`https://www.openstreetmap.org/way/${way.id}`}
                  rel="noreferrer"
                  target="_blank"
                  style={{ fontSize: '0.8rem' }}
                >
                  #{way.id}
                </a>{' '}
                <button
                  onClick={() => toggle(way.id, way.name)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--theme-error-500, #c00)',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                  type="button"
                >
                  remove
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

function safeParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

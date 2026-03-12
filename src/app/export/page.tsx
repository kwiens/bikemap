'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { bikeRoutes } from '@/data/geo_data';
import { mapConfig } from '@/config/map.config';
import { buildSvg } from '@/utils/svg';
import { buildGpx } from '@/utils/gpx';

mapboxgl.accessToken = mapConfig.mapbox.accessToken;

interface RouteFeatures {
  routeId: string;
  features: GeoJSON.Feature[];
}

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-');
}

const buttonStyle: React.CSSProperties = {
  padding: '0.4rem 0.75rem',
  border: 'none',
  borderRadius: '6px',
  cursor: 'pointer',
  fontSize: '0.8rem',
  fontWeight: 500,
  whiteSpace: 'nowrap',
};

const disabledStyle: React.CSSProperties = {
  ...buttonStyle,
  background: '#d1d5db',
  color: '#9ca3af',
  cursor: 'default',
};

export default function ExportPage() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [routeFeatures, setRouteFeatures] = useState<RouteFeatures[]>([]);

  useEffect(() => {
    if (map.current || !mapContainer.current) return;

    const newMap = new mapboxgl.Map({
      container: mapContainer.current,
      style: mapConfig.mapbox.styleUrl,
      center: mapConfig.defaultView.center,
      zoom: 11,
      antialias: true,
    });

    map.current = newMap;

    newMap.on('load', () => {
      newMap.once('idle', () => {
        const style = newMap.getStyle();
        const results: RouteFeatures[] = [];

        for (const route of bikeRoutes) {
          const layer = style?.layers?.find((l) => l.id === route.id);
          if (!layer) continue;

          const sourceId = layer.source as string;
          const sourceLayer = (layer as Record<string, unknown>)[
            'source-layer'
          ] as string;
          if (!sourceId || !sourceLayer) continue;

          const features = newMap.querySourceFeatures(sourceId, {
            sourceLayer,
          });

          results.push({ routeId: route.id, features: [...features] });
        }

        setRouteFeatures(results);
        setMapLoaded(true);
      });
    });

    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, []);

  function handleDownloadGpx(routeId: string) {
    const route = bikeRoutes.find((r) => r.id === routeId);
    const rf = routeFeatures.find((r) => r.routeId === routeId);
    if (!route || !rf) return;

    const gpx = buildGpx([
      {
        name: route.name,
        description: route.description,
        features: rf.features,
      },
    ]);
    if (gpx)
      downloadFile(gpx, `${slugify(route.name)}.gpx`, 'application/gpx+xml');
  }

  function handleDownloadSvg(routeId: string) {
    const route = bikeRoutes.find((r) => r.id === routeId);
    const rf = routeFeatures.find((r) => r.routeId === routeId);
    if (!route || !rf) return;

    const svg = buildSvg(rf.features, route.color);
    if (svg) downloadFile(svg, `${slugify(route.name)}.svg`, 'image/svg+xml');
  }

  function handleDownloadAllGpx() {
    const tracks = routeFeatures.flatMap((rf) => {
      const route = bikeRoutes.find((r) => r.id === rf.routeId);
      return route
        ? [
            {
              name: route.name,
              description: route.description,
              features: rf.features,
            },
          ]
        : [];
    });
    const gpx = buildGpx(tracks);
    if (gpx)
      downloadFile(gpx, 'chattanooga-bike-routes.gpx', 'application/gpx+xml');
  }

  function handleDownloadAllSvg() {
    for (const rf of routeFeatures) {
      const route = bikeRoutes.find((r) => r.id === rf.routeId);
      if (!route) continue;
      const svg = buildSvg(rf.features, route.color);
      if (svg) downloadFile(svg, `${slugify(route.name)}.svg`, 'image/svg+xml');
    }
  }

  const allButtonStyle: React.CSSProperties = {
    ...buttonStyle,
    padding: '0.5rem 1rem',
    background: '#111',
    color: '#fff',
    fontSize: '0.875rem',
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        overflow: 'auto',
        background: '#fff',
      }}
    >
      <div
        style={{
          padding: '2rem',
          maxWidth: '800px',
          margin: '0 auto',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <h1 style={{ marginBottom: '0.5rem' }}>Export Bike Routes</h1>
        <p style={{ color: '#666', marginBottom: '1.5rem' }}>
          {mapLoaded
            ? `${routeFeatures.length} routes available for download`
            : 'Loading route data from map...'}
        </p>

        {/* Hidden map container for querying vector tile features */}
        <div
          ref={mapContainer}
          style={{
            width: '1px',
            height: '1px',
            position: 'absolute',
            left: '-9999px',
            overflow: 'hidden',
          }}
        />

        {mapLoaded && (
          <div
            style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem' }}
          >
            <button
              type="button"
              onClick={handleDownloadAllGpx}
              style={allButtonStyle}
            >
              Download All (GPX)
            </button>
            <button
              type="button"
              onClick={handleDownloadAllSvg}
              style={allButtonStyle}
            >
              Download All (SVG)
            </button>
          </div>
        )}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: '1rem',
          }}
        >
          {bikeRoutes.map((route) => {
            const rf = routeFeatures.find((r) => r.routeId === route.id);
            const featureCount = rf?.features.length ?? 0;
            const ready = mapLoaded && featureCount > 0;
            const activeStyle: React.CSSProperties = {
              ...buttonStyle,
              background: route.color,
              color: '#fff',
            };

            return (
              <div
                key={route.id}
                style={{
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  padding: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1rem',
                }}
              >
                <div
                  style={{
                    width: '12px',
                    height: '12px',
                    borderRadius: '50%',
                    background: route.color,
                    flexShrink: 0,
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{route.name}</div>
                  <div style={{ fontSize: '0.8rem', color: '#888' }}>
                    {mapLoaded
                      ? `${featureCount} feature${featureCount !== 1 ? 's' : ''}`
                      : 'Loading...'}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  <button
                    type="button"
                    disabled={!ready}
                    onClick={() => handleDownloadGpx(route.id)}
                    style={ready ? activeStyle : disabledStyle}
                  >
                    GPX
                  </button>
                  <button
                    type="button"
                    disabled={!ready}
                    onClick={() => handleDownloadSvg(route.id)}
                    style={ready ? activeStyle : disabledStyle}
                  >
                    SVG
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <p style={{ marginTop: '2rem' }}>
          <Link href="/" style={{ color: '#3b82f6', textDecoration: 'none' }}>
            &larr; Back to map
          </Link>
        </p>
      </div>
    </div>
  );
}

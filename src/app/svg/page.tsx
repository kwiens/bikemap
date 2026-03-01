'use client';

import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { bikeRoutes } from '@/data/geo_data';
import { mapConfig } from '@/config/map.config';

mapboxgl.accessToken = mapConfig.mapbox.accessToken;

interface RouteFeatures {
  routeId: string;
  features: GeoJSON.Feature[];
}

function mercatorX(lng: number): number {
  return ((lng + 180) / 360) * 256;
}

function mercatorY(lat: number): number {
  const latRad = (lat * Math.PI) / 180;
  return (
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) *
    256
  );
}

function buildSvg(features: GeoJSON.Feature[], color: string): string | null {
  const allCoords: [number, number][] = [];

  for (const feature of features) {
    const geom = feature.geometry;
    if (geom.type === 'LineString') {
      for (const coord of geom.coordinates) {
        allCoords.push([coord[0], coord[1]]);
      }
    } else if (geom.type === 'MultiLineString') {
      for (const line of geom.coordinates) {
        for (const coord of line) {
          allCoords.push([coord[0], coord[1]]);
        }
      }
    }
  }

  if (allCoords.length === 0) return null;

  // Project all coordinates
  const projected = allCoords.map(
    ([lng, lat]) => [mercatorX(lng), mercatorY(lat)] as [number, number],
  );

  const minX = Math.min(...projected.map((p) => p[0]));
  const maxX = Math.max(...projected.map((p) => p[0]));
  const minY = Math.min(...projected.map((p) => p[1]));
  const maxY = Math.max(...projected.map((p) => p[1]));

  const width = maxX - minX;
  const height = maxY - minY;
  const padding = Math.max(width, height) * 0.05;

  // Build path data from each feature
  const paths: string[] = [];
  for (const feature of features) {
    const geom = feature.geometry;
    const lines: GeoJSON.Position[][] =
      geom.type === 'LineString'
        ? [geom.coordinates]
        : geom.type === 'MultiLineString'
          ? geom.coordinates
          : [];

    for (const line of lines) {
      if (line.length < 2) continue;
      const segments = line.map((coord, i) => {
        const x = mercatorX(coord[0]) - minX + padding;
        const y = mercatorY(coord[1]) - minY + padding;
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(4)} ${y.toFixed(4)}`;
      });
      paths.push(segments.join(' '));
    }
  }

  if (paths.length === 0) return null;

  const svgWidth = width + padding * 2;
  const svgHeight = height + padding * 2;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth.toFixed(4)} ${svgHeight.toFixed(4)}" width="800" height="${((800 * svgHeight) / svgWidth).toFixed(0)}">`,
    `  <path d="${paths.join(' ')}" fill="none" stroke="${color}" stroke-width="${(Math.max(svgWidth, svgHeight) * 0.01).toFixed(4)}" stroke-linecap="round" stroke-linejoin="round"/>`,
    '</svg>',
  ].join('\n');
}

function downloadSvg(svg: string, filename: string) {
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AdminPage() {
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
      zoom: 11, // Zoom out to ensure all route tiles load
      antialias: true,
    });

    map.current = newMap;

    newMap.on('load', () => {
      // Wait for tiles to render before querying
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

  function handleDownload(routeId: string) {
    const route = bikeRoutes.find((r) => r.id === routeId);
    const rf = routeFeatures.find((r) => r.routeId === routeId);
    if (!route || !rf) return;

    const svg = buildSvg(rf.features, route.color);
    if (!svg) {
      alert(`No features found for ${route.name}`);
      return;
    }

    const filename = `${route.name.toLowerCase().replace(/\s+/g, '-')}.svg`;
    downloadSvg(svg, filename);
  }

  function handleDownloadAll() {
    for (const rf of routeFeatures) {
      const route = bikeRoutes.find((r) => r.id === rf.routeId);
      if (!route) continue;

      const svg = buildSvg(rf.features, route.color);
      if (!svg) continue;

      const filename = `${route.name.toLowerCase().replace(/\s+/g, '-')}.svg`;
      downloadSvg(svg, filename);
    }
  }

  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ marginBottom: '0.5rem' }}>Admin: Route SVG Export</h1>
      <p style={{ color: '#666', marginBottom: '1.5rem' }}>
        {mapLoaded
          ? `Map loaded — ${routeFeatures.length} routes found`
          : 'Loading map and querying route features...'}
      </p>

      {/* Hidden map container — needed to query vector tile features */}
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
        <button
          type="button"
          onClick={handleDownloadAll}
          style={{
            marginBottom: '1.5rem',
            padding: '0.5rem 1rem',
            background: '#111',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '0.875rem',
          }}
        >
          Download All SVGs
        </button>
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
              <button
                type="button"
                disabled={!mapLoaded || featureCount === 0}
                onClick={() => handleDownload(route.id)}
                style={{
                  padding: '0.4rem 0.75rem',
                  background:
                    mapLoaded && featureCount > 0 ? route.color : '#d1d5db',
                  color: mapLoaded && featureCount > 0 ? '#fff' : '#9ca3af',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: mapLoaded && featureCount > 0 ? 'pointer' : 'default',
                  fontSize: '0.8rem',
                  fontWeight: 500,
                  whiteSpace: 'nowrap',
                }}
              >
                Download SVG
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

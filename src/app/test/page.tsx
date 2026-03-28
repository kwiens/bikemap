'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import type { RecordedRide, RideStats } from '@/data/ride';
import {
  EXAMPLE_TRACKS,
  waypointsToRidePoints,
  type ExampleTrack,
} from '@/data/example-tracks';
import { parseGpxToRidePoints } from '@/utils/gpx-parser';
import { mapConfig } from '@/config/map.config';
import { computeRideStats, computeBounds } from '@/utils/ride-stats';
import { saveRide, loadAllRides, deleteRide } from '@/utils/ride-storage';

mapboxgl.accessToken = mapConfig.mapbox.accessToken;

// --- Helpers ---

function metersToMiles(m: number): string {
  return (m / 1609.344).toFixed(1);
}

function metersToFeet(m: number): string {
  return Math.round(m * 3.28084).toString();
}

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function buildRideFromPoints(
  name: string,
  points: import('@/data/ride').RidePoint[],
): RecordedRide {
  const stats = computeRideStats(points);
  const bounds = computeBounds(points) ?? [0, 0, 0, 0];
  // Strip accuracy/speed — only needed for stats computation above
  const storedPoints = points.map(({ lng, lat, altitude, timestamp }) => ({
    lng,
    lat,
    altitude,
    timestamp,
  }));
  return {
    id: crypto.randomUUID(),
    name,
    startTime: points[0]?.timestamp ?? Date.now(),
    endTime: points[points.length - 1]?.timestamp ?? Date.now(),
    points: storedPoints,
    stats,
    bounds,
  };
}

// --- Styles ---

const pageWrapStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  overflow: 'auto',
  background: '#fff',
};

const pageStyle: React.CSSProperties = {
  maxWidth: 800,
  margin: '0 auto',
  padding: '2rem 1.5rem',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  color: '#1a1a1a',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '1rem',
  marginBottom: '2rem',
};

const linkStyle: React.CSSProperties = {
  color: '#2563eb',
  textDecoration: 'none',
  fontSize: '0.9rem',
};

const sectionStyle: React.CSSProperties = {
  marginBottom: '2rem',
};

const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(340, 1fr))',
  gap: '1rem',
};

const cardStyle: React.CSSProperties = {
  border: '1px solid #e5e7eb',
  borderRadius: '8px',
  padding: '1rem',
  background: '#fff',
};

const cardNameStyle: React.CSSProperties = {
  fontWeight: 600,
  fontSize: '1rem',
  margin: '0 0 0.25rem',
};

const cardDescStyle: React.CSSProperties = {
  fontSize: '0.85rem',
  color: '#6b7280',
  margin: '0 0 0.75rem',
};

const statsRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '1rem',
  fontSize: '0.85rem',
  color: '#374151',
  marginBottom: '0.75rem',
};

const buttonStyle: React.CSSProperties = {
  padding: '0.4rem 0.75rem',
  border: 'none',
  borderRadius: '6px',
  cursor: 'pointer',
  fontSize: '0.8rem',
  fontWeight: 500,
};

const primaryBtn: React.CSSProperties = {
  ...buttonStyle,
  background: '#2563eb',
  color: '#fff',
};

const dangerBtn: React.CSSProperties = {
  ...buttonStyle,
  background: '#dc2626',
  color: '#fff',
};

const secondaryBtn: React.CSSProperties = {
  ...buttonStyle,
  background: '#e5e7eb',
  color: '#374151',
};

const feedbackStyle: React.CSSProperties = {
  fontSize: '0.8rem',
  color: '#16a34a',
  marginLeft: '0.5rem',
};

const fileInputStyle: React.CSSProperties = {
  fontSize: '0.85rem',
  marginBottom: '0.5rem',
};

const bulkBarStyle: React.CSSProperties = {
  display: 'flex',
  gap: '0.75rem',
  alignItems: 'center',
  marginBottom: '1.5rem',
  flexWrap: 'wrap',
};

// --- Draw Track Section ---

const DRAW_SOURCE = 'draw-track';
const DRAW_LINE = 'draw-track-line';
const DRAW_COLOR = '#ff6b35';

function DrawTrack({
  onSave,
}: {
  onSave: (name: string, coords: [number, number][]) => void;
}) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const drawingRef = useRef(false);
  const coordsRef = useRef<[number, number][]>([]);

  const [drawnCoords, setDrawnCoords] = useState<[number, number][]>([]);
  const [drawnStats, setDrawnStats] = useState<RideStats | null>(null);
  const [drawName, setDrawName] = useState('Drawn Track');
  const [saved, setSaved] = useState(false);

  const updateLine = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const source = map.getSource(DRAW_SOURCE) as mapboxgl.GeoJSONSource;
    if (!source) return;
    source.setData({
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: coordsRef.current },
    });
  }, []);

  const finishDrawing = useCallback(() => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    const map = mapRef.current;
    if (map) {
      map.dragPan.enable();
      map.getCanvas().style.cursor = '';
    }

    const coords = [...coordsRef.current];
    setDrawnCoords(coords);

    if (coords.length >= 2) {
      const waypoints: [number, number, number][] = coords.map(([lng, lat]) => [
        lng,
        lat,
        0,
      ]);
      const points = waypointsToRidePoints(waypoints);
      setDrawnStats(computeRideStats(points));
    } else {
      setDrawnStats(null);
    }
  }, []);

  // Initialize map
  useEffect(() => {
    if (mapRef.current || !mapContainer.current) return;

    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: mapConfig.mapbox.styleUrl,
      center: mapConfig.defaultView.center,
      zoom: 13,
      antialias: true,
    });
    mapRef.current = map;

    map.on('load', () => {
      // Add empty source + layer for drawing
      map.addSource(DRAW_SOURCE, {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates: [] },
        },
      });
      map.addLayer({
        id: DRAW_LINE,
        type: 'line',
        source: DRAW_SOURCE,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': DRAW_COLOR,
          'line-width': 4,
          'line-opacity': 0.85,
        },
      });
    });

    // Drawing handlers
    map.on('mousedown', (e) => {
      e.preventDefault();
      drawingRef.current = true;
      coordsRef.current = [[e.lngLat.lng, e.lngLat.lat]];
      map.dragPan.disable();
      map.getCanvas().style.cursor = 'crosshair';
      setDrawnStats(null);
      setDrawnCoords([]);
      setSaved(false);
    });

    map.on('mousemove', (e) => {
      if (!drawingRef.current) return;
      coordsRef.current.push([e.lngLat.lng, e.lngLat.lat]);
      updateLine();
    });

    map.on('mouseup', () => {
      finishDrawing();
    });

    // Finish drawing if mouse leaves the map canvas
    map.getCanvas().addEventListener('mouseleave', () => {
      finishDrawing();
    });

    // Touch support
    map.on('touchstart', (e) => {
      if (e.points.length !== 1) return; // single finger only
      e.preventDefault();
      const touch = e.lngLat;
      drawingRef.current = true;
      coordsRef.current = [[touch.lng, touch.lat]];
      map.dragPan.disable();
      setDrawnStats(null);
      setDrawnCoords([]);
      setSaved(false);
    });

    map.on('touchmove', (e) => {
      if (!drawingRef.current) return;
      if (e.points.length !== 1) return;
      coordsRef.current.push([e.lngLat.lng, e.lngLat.lat]);
      updateLine();
    });

    map.on('touchend', () => {
      finishDrawing();
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [updateLine, finishDrawing]);

  const handleClear = () => {
    coordsRef.current = [];
    setDrawnCoords([]);
    setDrawnStats(null);
    setSaved(false);
    updateLine();
  };

  const handleSave = () => {
    if (drawnCoords.length < 2) return;
    onSave(drawName.trim() || 'Drawn Track', drawnCoords);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div>
      <div
        ref={mapContainer}
        style={{
          width: '100%',
          height: 400,
          borderRadius: '8px',
          border: '1px solid #e5e7eb',
          marginBottom: '0.75rem',
        }}
      />
      <p
        style={{
          fontSize: '0.8rem',
          color: '#9ca3af',
          margin: '0 0 0.75rem',
        }}
      >
        Click and drag to draw a track. Release to finish.
      </p>

      {drawnStats && drawnCoords.length >= 2 && (
        <div style={cardStyle}>
          <div style={statsRowStyle}>
            <span>{metersToMiles(drawnStats.distance)} mi</span>
            <span>{formatDuration(drawnStats.elapsedTime)}</span>
            <span>{drawnCoords.length} pts</span>
          </div>
          <div
            style={{
              display: 'flex',
              gap: '0.5rem',
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
            <input
              type="text"
              value={drawName}
              onChange={(e) => setDrawName(e.target.value)}
              style={{
                padding: '0.35rem 0.5rem',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                fontSize: '0.85rem',
                flex: '1 1 150px',
              }}
            />
            <button type="button" style={primaryBtn} onClick={handleSave}>
              Save as Ride
            </button>
            <button type="button" style={secondaryBtn} onClick={handleClear}>
              Clear
            </button>
            {saved && <span style={feedbackStyle}>Saved!</span>}
          </div>
        </div>
      )}
    </div>
  );
}

// --- Track Card ---

interface TrackCardProps {
  track: ExampleTrack;
  precomputedStats?: RideStats;
  badge?: string;
  onAdd: () => void;
}

function TrackCard({ track, precomputedStats, badge, onAdd }: TrackCardProps) {
  const [added, setAdded] = useState(false);
  const stats =
    precomputedStats ??
    computeRideStats(waypointsToRidePoints(track.waypoints));

  const handleAdd = () => {
    onAdd();
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  };

  return (
    <div style={cardStyle}>
      <p style={cardNameStyle}>
        {track.name}
        {badge && (
          <span
            style={{
              marginLeft: '0.5rem',
              fontSize: '0.7rem',
              background: '#dbeafe',
              color: '#1d4ed8',
              padding: '0.15rem 0.4rem',
              borderRadius: '4px',
              verticalAlign: 'middle',
            }}
          >
            {badge}
          </span>
        )}
      </p>
      <p style={cardDescStyle}>{track.description}</p>
      <div style={statsRowStyle}>
        <span>{metersToMiles(stats.distance)} mi</span>
        <span>{formatDuration(stats.elapsedTime)}</span>
        <span>{metersToFeet(stats.elevationGain)} ft gain</span>
        <span>{track.waypoints.length} pts</span>
      </div>
      <button type="button" style={primaryBtn} onClick={handleAdd}>
        Add to My Rides
      </button>
      {added && <span style={feedbackStyle}>Saved!</span>}
    </div>
  );
}

// --- Main Page ---

export default function TestPage() {
  const [cherokeeTrack, setCherokeeTrack] = useState<ExampleTrack | null>(null);
  const [cherokeeStats, setCherokeeStats] = useState<RideStats | null>(null);
  const [cherokeePoints, setCherokeePoints] = useState<
    import('@/data/ride').RidePoint[] | null
  >(null);
  const [rideCount, setRideCount] = useState(0);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [bulkMsg, setBulkMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const refreshCount = useCallback(() => {
    setRideCount(loadAllRides().length);
  }, []);

  // Load Cherokee Loop GPX on mount
  useEffect(() => {
    fetch('/cherokee-loop.gpx')
      .then((r) => r.text())
      .then((xml) => {
        const points = parseGpxToRidePoints(xml);
        if (points.length < 2) return;
        const stats = computeRideStats(points);
        setCherokeePoints(points);
        setCherokeeStats(stats);
        setCherokeeTrack({
          name: 'Cherokee Loop',
          description: 'Classic Chattanooga loop loaded from GPX file',
          waypoints: points.map((p) => [p.lng, p.lat, p.altitude ?? 0]),
        });
      })
      .catch(() => {});
    refreshCount();
  }, [refreshCount]);

  const handleAddExample = (track: ExampleTrack) => {
    const points = waypointsToRidePoints(track.waypoints);
    const ride = buildRideFromPoints(track.name, points);
    saveRide(ride);
    refreshCount();
  };

  const handleAddCherokee = () => {
    if (!cherokeePoints) return;
    const ride = buildRideFromPoints('Cherokee Loop', cherokeePoints);
    saveRide(ride);
    refreshCount();
  };

  const handleAddAll = () => {
    let count = 0;
    for (const track of EXAMPLE_TRACKS) {
      const points = waypointsToRidePoints(track.waypoints);
      const ride = buildRideFromPoints(track.name, points);
      saveRide(ride);
      count++;
    }
    if (cherokeePoints) {
      const ride = buildRideFromPoints('Cherokee Loop', cherokeePoints);
      saveRide(ride);
      count++;
    }
    refreshCount();
    setBulkMsg(`Added ${count} rides`);
    setTimeout(() => setBulkMsg(null), 2000);
  };

  const handleClearAll = () => {
    const rides = loadAllRides();
    for (const r of rides) {
      deleteRide(r.id);
    }
    refreshCount();
    setBulkMsg('All rides cleared');
    setTimeout(() => setBulkMsg(null), 2000);
  };

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const xml = reader.result as string;
      const points = parseGpxToRidePoints(xml);
      if (points.length < 2) {
        setImportMsg('No valid track points found in GPX file');
        return;
      }
      const name = file.name.replace(/\.gpx$/i, '');
      const ride = buildRideFromPoints(name, points);
      saveRide(ride);
      refreshCount();
      setImportMsg(
        `Imported "${name}" — ${points.length} points, ${metersToMiles(ride.stats.distance)} mi`,
      );
      setTimeout(() => setImportMsg(null), 4000);
    };
    reader.readAsText(file);

    // Reset input so the same file can be re-imported
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleDrawSave = (name: string, coords: [number, number][]) => {
    const waypoints: [number, number, number][] = coords.map(([lng, lat]) => [
      lng,
      lat,
      0,
    ]);
    const points = waypointsToRidePoints(waypoints);
    const ride = buildRideFromPoints(name, points);
    saveRide(ride);
    refreshCount();
  };

  return (
    <div style={pageWrapStyle}>
      <div style={pageStyle}>
        <div style={headerStyle}>
          <h1 style={{ margin: 0, fontSize: '1.5rem' }}>Test Data</h1>
          <Link href="/" style={linkStyle}>
            Back to map
          </Link>
          <span
            style={{
              marginLeft: 'auto',
              fontSize: '0.85rem',
              color: '#6b7280',
            }}
          >
            {rideCount} ride{rideCount !== 1 ? 's' : ''} saved
          </span>
        </div>

        {/* Bulk actions */}
        <div style={bulkBarStyle}>
          <button type="button" style={secondaryBtn} onClick={handleAddAll}>
            Add All Example Rides
          </button>
          <button type="button" style={dangerBtn} onClick={handleClearAll}>
            Clear All Rides
          </button>
          {bulkMsg && <span style={feedbackStyle}>{bulkMsg}</span>}
        </div>

        {/* Draw a Track */}
        <div style={sectionStyle}>
          <h2 style={{ fontSize: '1.1rem', marginBottom: '0.75rem' }}>
            Draw a Track
          </h2>
          <DrawTrack onSave={handleDrawSave} />
        </div>

        {/* Example tracks */}
        <div style={sectionStyle}>
          <h2 style={{ fontSize: '1.1rem', marginBottom: '0.75rem' }}>
            Example Tracks
          </h2>
          <div style={gridStyle}>
            {EXAMPLE_TRACKS.map((track) => (
              <TrackCard
                key={track.name}
                track={track}
                onAdd={() => handleAddExample(track)}
              />
            ))}
            {cherokeeTrack && cherokeeStats && (
              <TrackCard
                track={cherokeeTrack}
                precomputedStats={cherokeeStats}
                badge="GPX"
                onAdd={handleAddCherokee}
              />
            )}
          </div>
        </div>

        {/* GPX Import */}
        <div style={sectionStyle}>
          <h2 style={{ fontSize: '1.1rem', marginBottom: '0.75rem' }}>
            Import GPX File
          </h2>
          <div style={cardStyle}>
            <p style={{ ...cardDescStyle, marginBottom: '0.5rem' }}>
              Import any GPX file to add it as a recorded ride. Works with
              exports from Strava, Komoot, RideWithGPS, etc.
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".gpx"
              onChange={handleFileImport}
              style={fileInputStyle}
            />
            {importMsg && (
              <p
                style={{
                  fontSize: '0.85rem',
                  color: '#16a34a',
                  marginTop: '0.5rem',
                }}
              >
                {importMsg}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

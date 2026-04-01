'use client';

import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from 'react';
import type { ElevationProfile as ElevationProfileData } from '@/data/geo_data';
import { slugify } from '@/utils/string';
import { MAP_EVENTS } from '@/events';
import { loadRide } from '@/utils/ride-storage';
import { rideToElevationProfile } from '@/utils/ride-stats';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faDownload,
  faShareAlt,
  faChevronDown,
  faChevronUp,
} from '@fortawesome/free-solid-svg-icons';
import { cn } from '@/lib/utils';

const CHART_HEIGHT = 100;
const CHART_PADDING_TOP = 4;
const CHART_PADDING_BOTTOM = 4;
const PLOT_HEIGHT = CHART_HEIGHT - CHART_PADDING_TOP - CHART_PADDING_BOTTOM;

const GRADE_YELLOW = 12;
const GRADE_RED = 25;
const MAX_GRADIENT_STOPS = 200;

const CHART_SVG_CLASS =
  'w-full h-[15vh] min-h-[80px] max-h-[160px] cursor-crosshair rounded touch-none';
const ACTION_BTN_CLASS =
  'bg-transparent border-none cursor-pointer text-gray-400 text-xs px-1.5 py-0.5 rounded hover:text-gray-600 hover:bg-gray-50';

export function gradeToColor(grade: number): string {
  const g = Math.min(Math.abs(grade), GRADE_RED);
  if (g <= GRADE_YELLOW) {
    const t = g / GRADE_YELLOW;
    const r = Math.round(34 + t * (234 - 34));
    const green = Math.round(197 + t * (179 - 197));
    const b = Math.round(94 + t * (8 - 94));
    return `rgb(${r},${green},${b})`;
  }
  const t = (g - GRADE_YELLOW) / (GRADE_RED - GRADE_YELLOW);
  const r = Math.round(234 + t * (239 - 234));
  const green = Math.round(179 - t * 179);
  const b = Math.round(8 + t * (68 - 8));
  return `rgb(${r},${green},${b})`;
}

export function computeGradeColors(
  points: [number, number, number, number][],
): string[] {
  if (points.length < 2) return points.map(() => gradeToColor(0));

  const rawGrades: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    const dx = points[i][0] - points[i - 1][0];
    const dy = points[i][1] - points[i - 1][1];
    rawGrades.push(dx > 0 ? (dy / dx) * 100 : 0);
  }

  const smoothed: number[] = [];
  const WINDOW = 2;
  for (let i = 0; i < rawGrades.length; i++) {
    let sum = 0;
    let count = 0;
    for (
      let j = Math.max(0, i - WINDOW);
      j <= Math.min(rawGrades.length - 1, i + WINDOW);
      j++
    ) {
      sum += rawGrades[j];
      count++;
    }
    smoothed.push(sum / count);
  }

  return smoothed.map((g) => gradeToColor(g));
}

export function downsampleStops(
  points: [number, number, number, number][],
  colors: string[],
  maxDist: number,
): { offset: number; color: string }[] {
  if (points.length <= MAX_GRADIENT_STOPS) {
    return colors.map((color, i) => ({
      offset: maxDist > 0 ? points[i][0] / maxDist : 0,
      color,
    }));
  }
  const step = (points.length - 1) / (MAX_GRADIENT_STOPS - 1);
  const stops: { offset: number; color: string }[] = [];
  for (let i = 0; i < MAX_GRADIENT_STOPS; i++) {
    const idx = Math.round(i * step);
    stops.push({
      offset: maxDist > 0 ? points[idx][0] / maxDist : 0,
      color: colors[idx],
    });
  }
  return stops;
}

// Profile data cache to avoid refetching on revisit
const profileCache = new Map<string, ElevationProfileData>();

function downloadGpx(profile: ElevationProfileData): void {
  const gpxPoints = profile.profile
    .map(
      ([, elev, lng, lat]) =>
        `      <trkpt lat="${lat}" lon="${lng}"><ele>${(elev / 3.28084).toFixed(1)}</ele></trkpt>`,
    )
    .join('\n');

  const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Bike Chatt" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>${profile.trail}</name>
    <trkseg>
${gpxPoints}
    </trkseg>
  </trk>
</gpx>`;

  const blob = new Blob([gpx], { type: 'application/gpx+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${slugify(profile.trail)}.gpx`;
  a.click();
  URL.revokeObjectURL(url);
}

// Find the closest profile point to a given lng/lat using squared Euclidean distance
// (with latitude correction for longitude scaling)
export function findClosestProfileIndex(
  points: [number, number, number, number][],
  lng: number,
  lat: number,
): number | null {
  if (points.length === 0) return null;

  // Approximate longitude scaling at this latitude
  const cosLat = Math.cos((lat * Math.PI) / 180);
  let bestIdx = 0;
  let bestDist = Number.POSITIVE_INFINITY;

  for (let i = 0; i < points.length; i++) {
    const dlng = (points[i][2] - lng) * cosLat;
    const dlat = points[i][3] - lat;
    const d = dlng * dlng + dlat * dlat;
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }

  // Only show if within ~200 meters (~0.002 degrees)
  if (bestDist > 0.002 * 0.002) return null;

  return bestIdx;
}

export function ElevationProfile() {
  const [trailName, setTrailName] = useState<string | null>(null);
  const [profile, setProfile] = useState<ElevationProfileData | null>(null);
  const [loading, setLoading] = useState(false);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [locationIndex, setLocationIndex] = useState<number | null>(null);
  const [chartWidth, setChartWidth] = useState(800);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [ridesPanelOpen, setRidesPanelOpen] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  // Track whether current profile is from a route, trail, or ride selection
  const sourceRef = useRef<'trail' | 'route' | 'ride' | null>(null);
  // Keep profile in a ref so location handler always sees latest
  const profileRef = useRef<ElevationProfileData | null>(null);

  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const handleTrailSelect = (e: Event) => {
      const { trailName: name } = (e as CustomEvent).detail;
      sourceRef.current = 'trail';
      setTrailName(name);
      window.history.replaceState(null, '', `?trail=${slugify(name)}`);
    };
    const handleRouteSelect = () => {
      // Routes don't show elevation profiles — only trails and recorded rides do
      if (sourceRef.current === 'route') {
        sourceRef.current = null;
        setTrailName(null);
        setProfile(null);
        profileRef.current = null;
      }
    };
    const handleTrailDeselect = () => {
      if (sourceRef.current === 'trail') {
        sourceRef.current = null;
        setTrailName(null);
        window.history.replaceState(null, '', window.location.pathname);
      }
    };
    const handleRouteDeselect = () => {
      if (sourceRef.current === 'route') {
        sourceRef.current = null;
        setTrailName(null);
        window.history.replaceState(null, '', window.location.pathname);
      }
    };
    const handleSidebarToggle = (e: Event) => {
      setSidebarOpen((e as CustomEvent).detail.isOpen);
    };
    const handleRidesPanelToggle = (e: Event) => {
      setRidesPanelOpen((e as CustomEvent).detail.isOpen);
    };
    let latestRideId: string | null = null;
    const handleRideSelect = async (e: Event) => {
      const { rideId } = (e as CustomEvent).detail;
      latestRideId = rideId;
      const ride = await loadRide(rideId);
      if (!ride || latestRideId !== rideId) return; // stale check
      const elevProfile = rideToElevationProfile(ride);
      sourceRef.current = 'ride';
      if (elevProfile) {
        setTrailName(ride.name);
        profileCache.set(ride.name, elevProfile);
        setProfile(elevProfile);
        profileRef.current = elevProfile;
        setHoverIndex(null);
        setLocationIndex(null);
        setLoading(false);
      } else {
        setTrailName(null);
        setProfile(null);
        profileRef.current = null;
      }
    };
    const handleRideDeselect = () => {
      if (sourceRef.current === 'ride') {
        sourceRef.current = null;
        setTrailName(null);
        setProfile(null);
        profileRef.current = null;
        window.history.replaceState(null, '', window.location.pathname);
      }
    };
    const handleRecordingStart = () => {
      // Hide elevation profile during recording — not enough data for a
      // meaningful chart and the panel just gets in the way.
      sourceRef.current = null;
      setTrailName(null);
      setProfile(null);
      profileRef.current = null;
    };
    const handleRecordingStop = () => {
      if (sourceRef.current === 'ride') {
        sourceRef.current = null;
        setTrailName(null);
        setProfile(null);
        profileRef.current = null;
      }
    };

    window.addEventListener(MAP_EVENTS.TRAIL_SELECT, handleTrailSelect);
    window.addEventListener(MAP_EVENTS.TRAIL_DESELECT, handleTrailDeselect);
    window.addEventListener(MAP_EVENTS.ROUTE_SELECT, handleRouteSelect);
    window.addEventListener(MAP_EVENTS.ROUTE_DESELECT, handleRouteDeselect);
    window.addEventListener(MAP_EVENTS.SIDEBAR_TOGGLE, handleSidebarToggle);
    window.addEventListener(
      MAP_EVENTS.RIDES_PANEL_TOGGLE,
      handleRidesPanelToggle,
    );
    window.addEventListener(MAP_EVENTS.RIDE_SELECT, handleRideSelect);
    window.addEventListener(MAP_EVENTS.RIDE_DESELECT, handleRideDeselect);
    window.addEventListener(
      MAP_EVENTS.RIDE_RECORDING_START,
      handleRecordingStart,
    );
    window.addEventListener(
      MAP_EVENTS.RIDE_RECORDING_STOP,
      handleRecordingStop,
    );

    return () => {
      window.removeEventListener(MAP_EVENTS.TRAIL_SELECT, handleTrailSelect);
      window.removeEventListener(
        MAP_EVENTS.TRAIL_DESELECT,
        handleTrailDeselect,
      );
      window.removeEventListener(MAP_EVENTS.ROUTE_SELECT, handleRouteSelect);
      window.removeEventListener(
        MAP_EVENTS.ROUTE_DESELECT,
        handleRouteDeselect,
      );
      window.removeEventListener(
        MAP_EVENTS.SIDEBAR_TOGGLE,
        handleSidebarToggle,
      );
      window.removeEventListener(
        MAP_EVENTS.RIDES_PANEL_TOGGLE,
        handleRidesPanelToggle,
      );
      window.removeEventListener(MAP_EVENTS.RIDE_SELECT, handleRideSelect);
      window.removeEventListener(MAP_EVENTS.RIDE_DESELECT, handleRideDeselect);
      window.removeEventListener(
        MAP_EVENTS.RIDE_RECORDING_START,
        handleRecordingStart,
      );
      window.removeEventListener(
        MAP_EVENTS.RIDE_RECORDING_STOP,
        handleRecordingStop,
      );
    };
  }, []);

  // Listen for GPS location updates and find closest point on trail
  useEffect(() => {
    const handler = (e: Event) => {
      const { lng, lat } = (e as CustomEvent).detail;
      if (!profileRef.current) {
        setLocationIndex(null);
        return;
      }
      const idx = findClosestProfileIndex(profileRef.current.profile, lng, lat);
      setLocationIndex((prev) => (prev === idx ? prev : idx));
    };

    window.addEventListener(MAP_EVENTS.LOCATION_UPDATE, handler);
    return () =>
      window.removeEventListener(MAP_EVENTS.LOCATION_UPDATE, handler);
  }, []);

  useEffect(() => {
    if (!trailName) {
      setProfile(null);
      profileRef.current = null;
      setLocationIndex(null);
      return;
    }

    // Ride profiles are set directly by the RIDE_SELECT handler — skip fetch
    if (sourceRef.current === 'ride') return;

    const cached = profileCache.get(trailName);
    if (cached) {
      setProfile(cached);
      profileRef.current = cached;
      setHoverIndex(null);
      setLocationIndex(null);
      return;
    }

    setLoading(true);
    setProfile(null);
    profileRef.current = null;
    setHoverIndex(null);
    setLocationIndex(null);

    const controller = new AbortController();
    const slug = slugify(trailName);
    fetch(`/data/elevation/${slug}.json`, { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: ElevationProfileData) => {
        profileCache.set(trailName, data);
        setProfile(data);
        profileRef.current = data;
        setLoading(false);
      })
      .catch((err) => {
        if (err.name !== 'AbortError') setLoading(false);
      });

    return () => controller.abort();
  }, [trailName]);

  // Measure chart width via ResizeObserver
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      const w = Math.round(entries[0].contentRect.width);
      if (w > 0) setChartWidth(w);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [profile]);

  const updateHoverFromX = useCallback(
    (clientX: number, rect: DOMRect) => {
      if (!profile || profile.profile.length === 0) return;
      const x = clientX - rect.left;
      const fraction = Math.max(0, Math.min(1, x / rect.width));
      const maxDist = profile.profile[profile.profile.length - 1][0];
      const targetDist = fraction * maxDist;

      let lo = 0;
      let hi = profile.profile.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (profile.profile[mid][0] < targetDist) lo = mid + 1;
        else hi = mid;
      }
      const idx = Math.max(0, Math.min(lo, profile.profile.length - 1));
      setHoverIndex(idx);

      const pt = profile.profile[idx];
      window.dispatchEvent(
        new CustomEvent(MAP_EVENTS.ELEVATION_HOVER, {
          detail: { lng: pt[2], lat: pt[3] },
        }),
      );
    },
    [profile],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      updateHoverFromX(e.clientX, e.currentTarget.getBoundingClientRect());
    },
    [updateHoverFromX],
  );

  const handleTouch = useCallback(
    (e: React.TouchEvent<SVGSVGElement>) => {
      e.preventDefault();
      const touch = e.touches[0];
      updateHoverFromX(touch.clientX, e.currentTarget.getBoundingClientRect());
    },
    [updateHoverFromX],
  );

  const clearHover = useCallback(() => {
    setHoverIndex(null);
    window.dispatchEvent(
      new CustomEvent(MAP_EVENTS.ELEVATION_HOVER, {
        detail: { lng: null, lat: null },
      }),
    );
  }, []);

  const gradeColors = useMemo(
    () => (profile ? computeGradeColors(profile.profile) : []),
    [profile],
  );

  if (!trailName || loading || !profile || profile.profile.length < 2) {
    return null;
  }

  const points = profile.profile;
  const maxDist = points[points.length - 1][0];

  return (
    <div
      className={cn(
        'absolute bottom-1 left-[296px] right-4 bg-white rounded-lg shadow-[0_2px_12px_rgba(0,0,0,0.15)] px-4 pt-2.5 pb-1.5 z-[600] pointer-events-auto',
        'max-md:left-2 max-md:right-2 max-md:bottom-[60px] max-md:px-2 max-md:pt-2 max-md:pb-1',
        sidebarOpen ? 'max-md:hidden' : 'left-4',
        ridesPanelOpen && 'right-[296px]',
      )}
    >
      <div className="flex items-center gap-3 mb-1">
        <span className="text-[13px] font-semibold text-gray-700 whitespace-nowrap overflow-hidden text-ellipsis">
          {trailName}
        </span>
        <div className="flex gap-3 text-[11px] text-gray-500 ml-auto shrink-0">
          <span>{(maxDist / 5280).toFixed(1)} mi</span>
          <span>+{Math.round(profile.gain).toLocaleString()} ft climbing</span>
        </div>
        <div className="flex gap-1 ml-2 shrink-0">
          <button
            type="button"
            className={ACTION_BTN_CLASS}
            onClick={() => {
              navigator.clipboard.writeText(window.location.href);
              window.dispatchEvent(
                new CustomEvent(MAP_EVENTS.TOAST, {
                  detail: { message: 'Link copied' },
                }),
              );
            }}
            title="Copy link"
          >
            <FontAwesomeIcon icon={faShareAlt} />
          </button>
          <button
            type="button"
            className={ACTION_BTN_CLASS}
            onClick={() => downloadGpx(profile)}
            title="Download GPX"
          >
            <FontAwesomeIcon icon={faDownload} />
          </button>
          <button
            type="button"
            className={ACTION_BTN_CLASS}
            onClick={() => setCollapsed(!collapsed)}
            title={collapsed ? 'Expand' : 'Collapse'}
          >
            <FontAwesomeIcon icon={collapsed ? faChevronUp : faChevronDown} />
          </button>
        </div>
      </div>

      {!collapsed && (
        <>
          <div className="flex relative">
            <div className="flex flex-col justify-between py-0.5 shrink-0 w-[42px]">
              <span className="text-[9px] text-gray-400 text-right pr-1 leading-none">
                {Math.round(profile.max).toLocaleString()} ft
              </span>
              <span className="text-[9px] text-gray-400 text-right pr-1 leading-none">
                {Math.round(profile.min).toLocaleString()} ft
              </span>
            </div>

            <div className="relative flex-1">
              <ElevationSvg
                points={points}
                gradeColors={gradeColors}
                profile={profile}
                chartWidth={chartWidth}
                svgRef={svgRef}
                onMouseMove={handleMouseMove}
                onMouseLeave={clearHover}
                onTouchStart={handleTouch}
                onTouchMove={handleTouch}
                onTouchEnd={clearHover}
              />
              {locationIndex !== null && (
                <LocationIndicator
                  points={points}
                  profile={profile}
                  chartWidth={chartWidth}
                  locationIndex={locationIndex}
                />
              )}
              {hoverIndex !== null && (
                <HoverIndicator
                  points={points}
                  gradeColors={gradeColors}
                  profile={profile}
                  chartWidth={chartWidth}
                  hoverIndex={hoverIndex}
                />
              )}
            </div>
          </div>

          <div className="text-[11px] text-gray-600 text-center py-0.5 min-h-4">
            {hoverIndex !== null
              ? `${(points[hoverIndex][0] / 5280).toFixed(2)} mi \u00B7 ${Math.round(points[hoverIndex][1]).toLocaleString()} ft`
              : '\u00A0'}
          </div>
        </>
      )}
    </div>
  );
}

// Memoized SVG — paths and gradients only rebuild when profile/width changes, not on hover
const ElevationSvg = React.memo(function ElevationSvg({
  points,
  gradeColors,
  profile,
  chartWidth,
  svgRef,
  onMouseMove,
  onMouseLeave,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
}: {
  points: [number, number, number, number][];
  gradeColors: string[];
  profile: ElevationProfileData;
  chartWidth: number;
  svgRef: React.RefObject<SVGSVGElement | null>;
  onMouseMove: (e: React.MouseEvent<SVGSVGElement>) => void;
  onMouseLeave: () => void;
  onTouchStart: (e: React.TouchEvent<SVGSVGElement>) => void;
  onTouchMove: (e: React.TouchEvent<SVGSVGElement>) => void;
  onTouchEnd: () => void;
}) {
  const maxDist = points[points.length - 1][0];
  const yRange = profile.max - profile.min || 1;

  const xScale = (d: number) => (d / maxDist) * chartWidth;
  const yScale = (e: number) =>
    CHART_PADDING_TOP +
    PLOT_HEIGHT -
    ((e - profile.min) / yRange) * PLOT_HEIGHT;

  const linePath = points
    .map(
      (p, i) =>
        `${i === 0 ? 'M' : 'L'}${xScale(p[0]).toFixed(1)} ${yScale(p[1]).toFixed(1)}`,
    )
    .join(' ');

  const areaPath = `${linePath} L${chartWidth} ${CHART_HEIGHT - CHART_PADDING_BOTTOM} L0 ${CHART_HEIGHT - CHART_PADDING_BOTTOM} Z`;

  const gradientStops = downsampleStops(points, gradeColors, maxDist);

  return (
    <svg
      viewBox={`0 0 ${chartWidth} ${CHART_HEIGHT}`}
      className={CHART_SVG_CLASS}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      preserveAspectRatio="none"
      ref={svgRef}
      role="img"
      aria-label={`Elevation profile for ${profile.trail}`}
    >
      <defs>
        <linearGradient
          id="grade-stroke"
          x1="0"
          y1="0"
          x2="1"
          y2="0"
          gradientUnits="objectBoundingBox"
        >
          {gradientStops.map((s) => (
            <stop
              key={s.offset}
              offset={`${(s.offset * 100).toFixed(2)}%`}
              stopColor={s.color}
            />
          ))}
        </linearGradient>
        <linearGradient
          id="grade-fill"
          x1="0"
          y1="0"
          x2="1"
          y2="0"
          gradientUnits="objectBoundingBox"
        >
          {gradientStops.map((s) => (
            <stop
              key={s.offset}
              offset={`${(s.offset * 100).toFixed(2)}%`}
              stopColor={s.color}
              stopOpacity="0.2"
            />
          ))}
        </linearGradient>
      </defs>

      <line
        x1="0"
        y1={CHART_PADDING_TOP}
        x2={chartWidth}
        y2={CHART_PADDING_TOP}
        stroke="#9ca3af"
        strokeWidth="1"
        strokeDasharray="4,4"
        vectorEffect="non-scaling-stroke"
      />

      <path d={areaPath} fill="url(#grade-fill)" />
      <path
        d={linePath}
        fill="none"
        stroke="url(#grade-stroke)"
        strokeWidth="3"
        vectorEffect="non-scaling-stroke"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
});

export function profilePointToXY(
  points: [number, number, number, number][],
  index: number,
  profile: ElevationProfileData,
  chartWidth: number,
): { x: number; y: number } {
  const maxDist = points[points.length - 1][0];
  const yRange = profile.max - profile.min || 1;
  return {
    x: (points[index][0] / maxDist) * chartWidth,
    y:
      CHART_PADDING_TOP +
      PLOT_HEIGHT -
      ((points[index][1] - profile.min) / yRange) * PLOT_HEIGHT,
  };
}

// Lightweight hover overlay — renders on every mouse move without rebuilding paths
function HoverIndicator({
  points,
  gradeColors,
  profile,
  chartWidth,
  hoverIndex,
}: {
  points: [number, number, number, number][];
  gradeColors: string[];
  profile: ElevationProfileData;
  chartWidth: number;
  hoverIndex: number;
}) {
  const { x, y } = profilePointToXY(points, hoverIndex, profile, chartWidth);

  return (
    <svg
      viewBox={`0 0 ${chartWidth} ${CHART_HEIGHT}`}
      className={`${CHART_SVG_CLASS} absolute top-0 left-0 pointer-events-none`}
      preserveAspectRatio="none"
    >
      <line
        x1={x}
        y1={CHART_PADDING_TOP}
        x2={x}
        y2={CHART_HEIGHT - CHART_PADDING_BOTTOM}
        stroke="#6b7280"
        strokeWidth="1"
        strokeDasharray="3,3"
        vectorEffect="non-scaling-stroke"
      />
      <circle
        cx={x}
        cy={y}
        r="4"
        fill={gradeColors[hoverIndex] || '#22c55e'}
        stroke="white"
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

// Shows the user's current GPS position on the elevation chart
function LocationIndicator({
  points,
  profile,
  chartWidth,
  locationIndex,
}: {
  points: [number, number, number, number][];
  profile: ElevationProfileData;
  chartWidth: number;
  locationIndex: number;
}) {
  const { x, y } = profilePointToXY(points, locationIndex, profile, chartWidth);
  const leftPct = (x / chartWidth) * 100;
  const topPct = (y / CHART_HEIGHT) * 100;

  return (
    <div
      className="absolute w-[18px] h-[18px] rounded-full bg-[#4285F4] border-2 border-white shadow-[0_1px_4px_rgba(0,0,0,0.4)] -translate-x-1/2 -translate-y-1/2 pointer-events-none"
      style={{ left: `${leftPct}%`, top: `${topPct}%` }}
    />
  );
}

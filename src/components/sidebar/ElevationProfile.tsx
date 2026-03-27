'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { ElevationProfile as ElevationProfileData } from '@/data/geo_data';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[/&]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

const CHART_HEIGHT = 100;
const CHART_PADDING_TOP = 4;
const CHART_PADDING_BOTTOM = 4;
const PLOT_HEIGHT = CHART_HEIGHT - CHART_PADDING_TOP - CHART_PADDING_BOTTOM;

const GRADE_YELLOW = 12;
const GRADE_RED = 25;

function gradeToColor(grade: number): string {
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

function computeGradeColors(
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

export function ElevationProfile() {
  const [trailName, setTrailName] = useState<string | null>(null);
  const [profile, setProfile] = useState<ElevationProfileData | null>(null);
  const [loading, setLoading] = useState(false);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [chartWidth, setChartWidth] = useState(800);

  useEffect(() => {
    const handleTrailSelect = (e: Event) => {
      const { trailName: name } = (e as CustomEvent).detail;
      setTrailName(name);
    };
    const handleTrailDeselect = () => setTrailName(null);
    const handleRouteSelect = () => setTrailName(null);

    window.addEventListener('trail-select', handleTrailSelect);
    window.addEventListener('trail-deselect', handleTrailDeselect);
    window.addEventListener('route-select', handleRouteSelect);

    return () => {
      window.removeEventListener('trail-select', handleTrailSelect);
      window.removeEventListener('trail-deselect', handleTrailDeselect);
      window.removeEventListener('route-select', handleRouteSelect);
    };
  }, []);

  useEffect(() => {
    if (!trailName) {
      setProfile(null);
      return;
    }
    setLoading(true);
    setProfile(null);
    setHoverIndex(null);

    const slug = slugify(trailName);
    fetch(`/data/elevation/${slug}.json`)
      .then((r) => r.json())
      .then((data: ElevationProfileData) => {
        setProfile(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [trailName]);

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
        new CustomEvent('elevation-hover', {
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

  const handleTouchMove = useCallback(
    (e: React.TouchEvent<SVGSVGElement>) => {
      e.preventDefault();
      const touch = e.touches[0];
      updateHoverFromX(touch.clientX, e.currentTarget.getBoundingClientRect());
    },
    [updateHoverFromX],
  );

  const handleTouchStart = useCallback(
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
      new CustomEvent('elevation-hover', { detail: { lng: null, lat: null } }),
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

  const gradientStops = gradeColors.map((color, i) => {
    const offset = maxDist > 0 ? points[i][0] / maxDist : 0;
    return { offset, color };
  });

  return (
    <div className="elevation-overlay">
      <div className="elevation-overlay-header">
        <span className="elevation-overlay-title">{trailName}</span>
        <div className="elevation-stats">
          <span>{(maxDist / 5280).toFixed(1)} mi</span>
          <span>+{profile.gain.toLocaleString()} ft climbing</span>
        </div>
      </div>

      <div className="elevation-chart-container">
        <div className="elevation-y-axis">
          <span className="elevation-y-label elevation-y-max">
            {profile.max.toLocaleString()} ft
          </span>
          <span className="elevation-y-label elevation-y-min">
            {profile.min.toLocaleString()} ft
          </span>
        </div>

        <svg
          viewBox={`0 0 ${chartWidth} ${CHART_HEIGHT}`}
          className="elevation-chart"
          onMouseMove={handleMouseMove}
          onMouseLeave={clearHover}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={clearHover}
          preserveAspectRatio="none"
          ref={(el) => {
            if (el) {
              const w = el.getBoundingClientRect().width;
              if (w > 0 && w !== chartWidth) setChartWidth(w);
            }
          }}
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

          {/* Max elevation reference line */}
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

          {hoverIndex !== null && (
            <>
              <line
                x1={xScale(points[hoverIndex][0])}
                y1={CHART_PADDING_TOP}
                x2={xScale(points[hoverIndex][0])}
                y2={CHART_HEIGHT - CHART_PADDING_BOTTOM}
                stroke="#6b7280"
                strokeWidth="1"
                strokeDasharray="3,3"
                vectorEffect="non-scaling-stroke"
              />
              <circle
                cx={xScale(points[hoverIndex][0])}
                cy={yScale(points[hoverIndex][1])}
                r="4"
                fill={gradeColors[hoverIndex] || '#22c55e'}
                stroke="white"
                strokeWidth="1.5"
                vectorEffect="non-scaling-stroke"
              />
            </>
          )}
        </svg>
      </div>

      <div className="elevation-tooltip">
        {hoverIndex !== null
          ? `${(points[hoverIndex][0] / 5280).toFixed(2)} mi \u00B7 ${points[hoverIndex][1].toLocaleString()} ft`
          : '\u00A0'}
      </div>
    </div>
  );
}

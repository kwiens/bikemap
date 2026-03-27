'use client';

import { useState, useEffect, useCallback } from 'react';
import type { ElevationProfile as ElevationProfileData } from '@/data/geo_data';

interface ElevationProfileProps {
  trailName: string;
}

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

export function ElevationProfile({ trailName }: ElevationProfileProps) {
  const [profile, setProfile] = useState<ElevationProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [chartWidth, setChartWidth] = useState(248);

  useEffect(() => {
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

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!profile || profile.profile.length === 0) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const fraction = x / rect.width;
      const maxDist = profile.profile[profile.profile.length - 1][0];
      const targetDist = fraction * maxDist;

      // Binary search for nearest point
      let lo = 0;
      let hi = profile.profile.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (profile.profile[mid][0] < targetDist) lo = mid + 1;
        else hi = mid;
      }
      setHoverIndex(Math.max(0, Math.min(lo, profile.profile.length - 1)));
    },
    [profile],
  );

  if (loading) {
    return <div className="elevation-loading">Loading elevation...</div>;
  }

  if (!profile || profile.profile.length < 2) {
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

  // Build SVG paths
  const lineSegments = points
    .map(
      (p, i) =>
        `${i === 0 ? 'M' : 'L'}${xScale(p[0]).toFixed(1)} ${yScale(p[1]).toFixed(1)}`,
    )
    .join(' ');

  const areaPath = `${lineSegments} L${chartWidth} ${CHART_HEIGHT - CHART_PADDING_BOTTOM} L0 ${CHART_HEIGHT - CHART_PADDING_BOTTOM} Z`;

  return (
    <div className="elevation-profile">
      <svg
        viewBox={`0 0 ${chartWidth} ${CHART_HEIGHT}`}
        className="elevation-chart"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverIndex(null)}
        preserveAspectRatio="none"
        ref={(el) => {
          if (el) {
            const w = el.getBoundingClientRect().width;
            if (w > 0 && w !== chartWidth) setChartWidth(w);
          }
        }}
      >
        <defs>
          <linearGradient id="elev-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.05" />
          </linearGradient>
        </defs>

        <path d={areaPath} fill="url(#elev-fill)" />
        <path
          d={lineSegments}
          fill="none"
          stroke="#3b82f6"
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
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
              r="3"
              fill="#3b82f6"
              vectorEffect="non-scaling-stroke"
            />
          </>
        )}
      </svg>

      <div className="elevation-tooltip">
        {hoverIndex !== null
          ? `${(points[hoverIndex][0] / 5280).toFixed(2)} mi \u00B7 ${points[hoverIndex][1].toLocaleString()} ft`
          : '\u00A0'}
      </div>

      <div className="elevation-stats">
        <span>
          {'\u2191'}
          {profile.gain.toLocaleString()} ft
        </span>
        <span>
          {'\u2193'}
          {profile.loss.toLocaleString()} ft
        </span>
        <span>
          {profile.min.toLocaleString()}&ndash;{profile.max.toLocaleString()} ft
        </span>
      </div>
    </div>
  );
}

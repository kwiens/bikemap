import React, { useState } from 'react';
import { sorbaTrails, regionFor } from '@/data/geo_data';
import type { MountainBikeTrailsProps } from './types';

function groupTrailsByRegionAndArea() {
  const grouped = new Map<string, Map<string, typeof sorbaTrails>>();
  for (const trail of sorbaTrails) {
    const region = regionFor(trail.recArea);
    const { recArea } = trail;
    if (!grouped.has(region)) {
      grouped.set(region, new Map());
    }
    const areas = grouped.get(region);
    if (!areas) continue;
    if (!areas.has(recArea)) {
      areas.set(recArea, []);
    }
    areas.get(recArea)?.push(trail);
  }
  return grouped;
}

const regionGroups = groupTrailsByRegionAndArea();

function toggleSet(
  setter: React.Dispatch<React.SetStateAction<Set<string>>>,
  item: string,
) {
  setter((prev) => {
    const next = new Set(prev);
    if (next.has(item)) {
      next.delete(item);
    } else {
      next.add(item);
    }
    return next;
  });
}

export function MountainBikeTrails({
  selectedTrail,
  onTrailSelect,
  onAreaSelect,
  isExpanded,
  onToggle,
}: MountainBikeTrailsProps) {
  const [expandedRegions, setExpandedRegions] = useState<Set<string>>(
    new Set(),
  );
  const [expandedAreas, setExpandedAreas] = useState<Set<string>>(new Set());

  function handleAreaClick(area: string) {
    toggleSet(setExpandedAreas, area);
    onAreaSelect(area);
  }

  return (
    <div className="section-container">
      <div
        className="section-title section-title-clickable"
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggle();
          }
        }}
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
      >
        <span className="section-title-chevron">
          {isExpanded ? '\u25BC' : '\u25B6'}
        </span>
        Mountain Bike Trails
      </div>
      {isExpanded && (
        <div className="section-items">
          {[...regionGroups.entries()].map(([region, areas]) => {
            const isRegionExpanded = expandedRegions.has(region);
            const regionTrailCount = [...areas.values()].reduce(
              (sum, trails) => sum + trails.length,
              0,
            );
            return (
              <React.Fragment key={region}>
                <div
                  className="region-heading region-clickable"
                  onClick={() => {
                    toggleSet(setExpandedRegions, region);
                    onAreaSelect(region);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      toggleSet(setExpandedRegions, region);
                      onAreaSelect(region);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  aria-expanded={isRegionExpanded}
                >
                  <span className="region-chevron">
                    {isRegionExpanded ? '\u25BC' : '\u25B6'}
                  </span>
                  {region}
                  <span className="region-count">{regionTrailCount}</span>
                </div>
                {isRegionExpanded &&
                  [...areas.entries()].map(([area, trails]) => {
                    const singleArea = areas.size === 1;
                    const isAreaExpanded =
                      singleArea || expandedAreas.has(area);
                    return (
                      <React.Fragment key={area}>
                        {!singleArea && (
                          <div
                            className="rec-area-heading rec-area-clickable"
                            onClick={() => handleAreaClick(area)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                handleAreaClick(area);
                              }
                            }}
                            role="button"
                            tabIndex={0}
                            aria-expanded={isAreaExpanded}
                          >
                            <span className="rec-area-chevron">
                              {isAreaExpanded ? '\u25BC' : '\u25B6'}
                            </span>
                            {area}
                            <span className="rec-area-count">
                              {trails.length}
                            </span>
                          </div>
                        )}
                        {isAreaExpanded &&
                          trails.map((trail) => (
                            <div
                              key={trail.trailName}
                              onClick={() => onTrailSelect(trail.trailName)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  onTrailSelect(trail.trailName);
                                }
                              }}
                              role="button"
                              tabIndex={0}
                              className={`route-item ${selectedTrail === trail.trailName ? 'route-item-selected' : ''}`}
                            >
                              <div className="card-header">
                                <div
                                  className="route-color-indicator"
                                  style={{ backgroundColor: trail.color }}
                                />
                                <span className="route-name">
                                  {trail.displayName}
                                </span>
                                {trail.distance || trail.elevationGain ? (
                                  <span className="trail-distance">
                                    {trail.distance
                                      ? `${trail.distance} mi`
                                      : ''}
                                    {trail.distance && trail.elevationGain
                                      ? ' \u00B7 '
                                      : ''}
                                    {trail.elevationGain
                                      ? `\u2191${trail.elevationGain} ft`
                                      : ''}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          ))}
                      </React.Fragment>
                    );
                  })}
              </React.Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
}

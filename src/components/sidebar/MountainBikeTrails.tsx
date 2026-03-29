import React, { useState, useEffect, useMemo, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faChevronRight,
  faChevronDown,
} from '@fortawesome/free-solid-svg-icons';
import { cn } from '@/lib/utils';
import { mountainBikeTrails, regionFor } from '@/data/geo_data';
import type { MountainBikeTrailsProps } from './types';
import type { MountainBikeTrail } from '@/data/mountain-bike-trails';

function groupTrailsByRegionAndArea() {
  const grouped = new Map<string, Map<string, typeof mountainBikeTrails>>();
  for (const trail of mountainBikeTrails) {
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

const regionTrailCounts = new Map<string, number>();
for (const [region, areas] of regionGroups) {
  let count = 0;
  for (const trails of areas.values()) count += trails.length;
  regionTrailCounts.set(region, count);
}

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

function trailShapeClass(rating: string | undefined) {
  const isAdvanced = rating === 'advanced' || rating === 'expert';
  return cn(
    'shrink-0',
    isAdvanced ? 'w-2.5 h-2.5 rotate-45 rounded-[1px]' : 'w-3 h-3',
    !isAdvanced && (rating === 'intermediate' ? 'rounded-sm' : 'rounded-full'),
  );
}

function TrailRow({
  trail,
  selectedTrail,
  onTrailSelect,
}: {
  trail: MountainBikeTrail;
  selectedTrail: string | null;
  onTrailSelect: (name: string) => void;
}) {
  return (
    <div
      onClick={() => onTrailSelect(trail.trailName)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onTrailSelect(trail.trailName);
        }
      }}
      role="button"
      tabIndex={0}
      data-selected={selectedTrail === trail.trailName || undefined}
      data-faded={
        (selectedTrail && selectedTrail !== trail.trailName) || undefined
      }
      className={cn(
        'p-2 rounded cursor-pointer transition-all duration-200 border border-transparent',
        selectedTrail === trail.trailName
          ? 'bg-blue-600/10 border-blue-600'
          : 'hover:bg-blue-600/5 hover:border-blue-500',
        selectedTrail && selectedTrail !== trail.trailName && 'opacity-70',
      )}
    >
      <div className="flex items-center gap-3">
        <div
          className={trailShapeClass(trail.rating)}
          style={{ backgroundColor: trail.color }}
        />
        <span className="font-medium text-[13px]">{trail.displayName}</span>
        {trail.distance || trail.elevationGain ? (
          <span className="text-[11px] text-gray-500 ml-auto shrink-0">
            {trail.distance ? `${trail.distance} mi` : ''}
            {trail.distance && trail.elevationGain ? ' \u00B7 ' : ''}
            {trail.elevationGain ? `\u2191${trail.elevationGain} ft` : ''}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function MountainBikeTrails({
  selectedTrail,
  onTrailSelect,
  onAreaSelect,
}: MountainBikeTrailsProps) {
  const [expandedRegions, setExpandedRegions] = useState<Set<string>>(
    new Set(),
  );
  const [expandedAreas, setExpandedAreas] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  // Filter trails by search query (matches trail name, area, or region)
  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return null;
    return mountainBikeTrails.filter((trail) => {
      const region = regionFor(trail.recArea);
      return (
        trail.trailName.toLowerCase().includes(q) ||
        trail.displayName.toLowerCase().includes(q) ||
        trail.recArea.toLowerCase().includes(q) ||
        region.toLowerCase().includes(q)
      );
    });
  }, [searchQuery]);

  // Auto-expand region and area when a trail is selected
  useEffect(() => {
    if (!selectedTrail) return;
    const trail = mountainBikeTrails.find((t) => t.trailName === selectedTrail);
    if (!trail) return;
    const region = regionFor(trail.recArea);
    setExpandedRegions((prev) => {
      if (prev.has(region)) return prev;
      return new Set(prev).add(region);
    });
    setExpandedAreas((prev) => {
      if (prev.has(trail.recArea)) return prev;
      return new Set(prev).add(trail.recArea);
    });
  }, [selectedTrail]);

  function handleAreaClick(area: string) {
    toggleSet(setExpandedAreas, area);
    onAreaSelect(area);
  }

  return (
    <div className="mb-6">
      <div className="flex flex-col gap-2">
        <div className="relative">
          <input
            ref={searchRef}
            type="text"
            className="w-full py-2 pr-8 pl-3 border border-gray-300 rounded-lg text-sm text-app-secondary bg-white outline-none focus:border-app-primary focus:ring-2 focus:ring-app-primary/30 placeholder:text-gray-400"
            placeholder="Search trails..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              className="absolute right-1 top-1/2 -translate-y-1/2 bg-transparent border-none text-lg text-gray-400 cursor-pointer px-2 py-1 leading-none hover:text-gray-500"
              onClick={() => {
                setSearchQuery('');
                searchRef.current?.focus();
              }}
              aria-label="Clear search"
            >
              &times;
            </button>
          )}
        </div>

        {searchResults ? (
          searchResults.length > 0 ? (
            searchResults.map((trail) => (
              <TrailRow
                key={trail.trailName}
                trail={trail}
                selectedTrail={selectedTrail}
                onTrailSelect={onTrailSelect}
              />
            ))
          ) : (
            <div className="p-3 text-center text-gray-400 text-sm">
              No trails found
            </div>
          )
        ) : (
          [...regionGroups.entries()].map(([region, areas]) => {
            const isRegionExpanded = expandedRegions.has(region);
            const regionTrailCount = regionTrailCounts.get(region) ?? 0;
            return (
              <React.Fragment key={region}>
                <div
                  className="text-xs font-bold text-gray-700 pt-2.5 pb-1 cursor-pointer rounded p-2.5 px-1 flex items-center whitespace-nowrap hover:bg-blue-600/5 hover:text-blue-600"
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
                  <span className="text-[9px] mr-1.5 inline-block w-3 shrink-0">
                    <FontAwesomeIcon
                      icon={isRegionExpanded ? faChevronDown : faChevronRight}
                      className="text-[10px]"
                    />
                  </span>
                  {region}
                  <span className="ml-auto text-[10px] font-normal text-gray-400">
                    {regionTrailCount}
                  </span>
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
                            className="text-[11px] font-semibold uppercase text-gray-500 tracking-wide py-2 pb-1 cursor-pointer rounded p-2 px-1 pl-4 flex items-baseline hover:bg-blue-600/5 hover:text-blue-600"
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
                            <span className="text-[8px] mr-1 inline-block w-2.5">
                              <FontAwesomeIcon
                                icon={
                                  isAreaExpanded
                                    ? faChevronDown
                                    : faChevronRight
                                }
                                className="text-[10px]"
                              />
                            </span>
                            {area}
                            <span className="ml-auto text-[10px] font-normal text-gray-400">
                              {trails.length}
                            </span>
                          </div>
                        )}
                        {isAreaExpanded &&
                          trails.map((trail) => (
                            <TrailRow
                              key={trail.trailName}
                              trail={trail}
                              selectedTrail={selectedTrail}
                              onTrailSelect={onTrailSelect}
                            />
                          ))}
                      </React.Fragment>
                    );
                  })}
              </React.Fragment>
            );
          })
        )}
      </div>
    </div>
  );
}

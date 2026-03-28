'use client';

import React, { useState, useEffect, useCallback } from 'react';
import type { RecordedRide, RideSummary } from '@/data/ride';
import { MAP_EVENTS } from '@/events';
import {
  getRideSummaries,
  getStorageUsage,
  loadRide,
} from '@/utils/ride-storage';
import {
  formatDistance,
  formatDurationShort,
  formatDate,
} from '@/utils/format';
import { RideDetail } from './RideDetail';

export interface RideHistoryProps {
  selectedRideId: string | null;
  onRideSelect: (rideId: string) => void;
}

export function RideHistory({
  selectedRideId,
  onRideSelect,
}: RideHistoryProps) {
  const [summaries, setSummaries] = useState<RideSummary[]>([]);
  const [selectedRide, setSelectedRide] = useState<RecordedRide | null>(null);

  const refreshSummaries = useCallback(() => {
    getRideSummaries().then(setSummaries);
  }, []);

  useEffect(() => {
    refreshSummaries();
  }, [refreshSummaries]);

  useEffect(() => {
    const handleStop = () => refreshSummaries();

    window.addEventListener(MAP_EVENTS.RIDE_RECORDING_STOP, handleStop);
    return () => {
      window.removeEventListener(MAP_EVENTS.RIDE_RECORDING_STOP, handleStop);
    };
  }, [refreshSummaries]);

  useEffect(() => {
    if (selectedRideId) {
      loadRide(selectedRideId).then(setSelectedRide);
    } else {
      setSelectedRide(null);
    }
  }, [selectedRideId]);

  const handleDetailClose = () => {
    setSelectedRide(null);
    window.dispatchEvent(new CustomEvent(MAP_EVENTS.RIDE_DESELECT));
  };

  const handleDeleted = () => {
    setSelectedRide(null);
    refreshSummaries();
  };

  if (selectedRide) {
    return (
      <RideDetail
        ride={selectedRide}
        onClose={handleDetailClose}
        onDeleted={handleDeleted}
      />
    );
  }

  if (summaries.length === 0) {
    return (
      <div className="px-3 py-4 text-gray-500 text-[13px] leading-relaxed">
        No rides recorded yet. Tap Record to start! Rides are stored in your
        browser and are not synced between devices or to the cloud.
      </div>
    );
  }

  return (
    <div className="section-items">
      {summaries.map((s) => (
        <div
          key={s.id}
          onClick={() => onRideSelect(s.id)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onRideSelect(s.id);
            }
          }}
          role="button"
          tabIndex={0}
          className={`route-item ${selectedRideId === s.id ? 'route-item-selected' : ''}`}
        >
          <div className="card-header">
            <div
              className="route-color-indicator"
              style={{ backgroundColor: '#ff6b35' }}
            />
            <span className="route-name">{s.name}</span>
          </div>
          <div className="route-description">
            {formatDate(s.startTime)} &middot;{' '}
            {formatDistance(s.stats.distance)} &middot;{' '}
            {formatDurationShort(s.stats.elapsedTime)}
          </div>
        </div>
      ))}
      <StorageIndicator />
    </div>
  );
}

function formatKB(kb: number): string {
  if (kb < 1024) return `${kb} KB`;
  if (kb < 1024 * 1024) return `${(kb / 1024).toFixed(1)} MB`;
  return `${(kb / (1024 * 1024)).toFixed(1)} GB`;
}

function StorageIndicator() {
  const [usage, setUsage] = useState<{
    usedKB: number;
    totalKB: number;
  } | null>(null);

  useEffect(() => {
    getStorageUsage().then(setUsage);
  }, []);

  if (!usage) return null;

  const { usedKB, totalKB } = usage;
  const pct = Math.min(100, (usedKB / totalKB) * 100);

  return (
    <div className="pt-3 pb-1 text-[11px] text-gray-500">
      <div className="h-1 rounded-sm bg-gray-200 mb-1">
        <div
          className={`h-full rounded-sm transition-[width] duration-300 ${pct > 80 ? 'bg-red-500' : 'bg-blue-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span>
        {formatKB(usedKB)} of {formatKB(totalKB)} used
      </span>
    </div>
  );
}

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBicycle } from '@fortawesome/free-solid-svg-icons';
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
  isRecording?: boolean;
}

export function RideHistory({
  selectedRideId,
  onRideSelect,
  isRecording,
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
      <div className="py-8 px-4 text-center text-gray-400">
        <FontAwesomeIcon
          icon={faBicycle}
          className="text-3xl mb-3 text-gray-300"
        />
        <p className="text-sm font-medium text-gray-500 mb-1">
          {isRecording ? 'Recording your ride' : 'Track your rides'}
        </p>
        <p className="text-xs leading-relaxed">
          {isRecording
            ? 'Logging your ride with GPS.'
            : 'Tap Record to start logging your ride with GPS.'}{' '}
          Rides are saved offline on your device.
        </p>
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

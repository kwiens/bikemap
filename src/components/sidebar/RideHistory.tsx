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
  formatBytes,
} from '@/utils/format';
import { cn } from '@/lib/utils';
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
    getRideSummaries()
      .then(setSummaries)
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshSummaries();
  }, [refreshSummaries]);

  useEffect(() => {
    const refresh = () => refreshSummaries();

    window.addEventListener(MAP_EVENTS.RIDE_RECORDING_STOP, refresh);
    window.addEventListener(MAP_EVENTS.RIDE_SELECT, refresh);
    window.addEventListener(MAP_EVENTS.RIDE_DESELECT, refresh);
    return () => {
      window.removeEventListener(MAP_EVENTS.RIDE_RECORDING_STOP, refresh);
      window.removeEventListener(MAP_EVENTS.RIDE_SELECT, refresh);
      window.removeEventListener(MAP_EVENTS.RIDE_DESELECT, refresh);
    };
  }, [refreshSummaries]);

  useEffect(() => {
    if (selectedRideId) {
      loadRide(selectedRideId)
        .then(setSelectedRide)
        .catch(() => {});
    } else {
      setSelectedRide(null);
    }
  }, [selectedRideId]);

  const handleDetailClose = () => {
    window.dispatchEvent(new CustomEvent(MAP_EVENTS.RIDE_DESELECT));
  };

  const handleDeleted = () => {
    window.dispatchEvent(new CustomEvent(MAP_EVENTS.RIDE_DESELECT));
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
    <div className="flex flex-col gap-2">
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
          className={cn(
            'p-2 rounded cursor-pointer transition-all duration-200 border border-transparent',
            selectedRideId === s.id
              ? 'bg-blue-600/10 border-blue-600'
              : 'hover:bg-blue-600/5 hover:border-blue-500',
          )}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-4 h-4 rounded"
              style={{ backgroundColor: '#ff6b35' }}
            />
            <span className="font-medium">{s.name}</span>
          </div>
          <div className="text-xs text-gray-500 mt-1 ml-7">
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

function StorageIndicator() {
  const [usage, setUsage] = useState<{
    usedKB: number;
    totalKB: number;
  } | null>(null);

  useEffect(() => {
    getStorageUsage()
      .then(setUsage)
      .catch(() => {});
  }, []);

  if (!usage || usage.totalKB === 0) return null;

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
        {formatBytes(usedKB)} of {formatBytes(totalKB)} used
      </span>
    </div>
  );
}

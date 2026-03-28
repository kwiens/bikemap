'use client';

import React, { useState, useEffect, useCallback } from 'react';
import type { RecordedRide, RideSummary } from '@/data/ride';
import { MAP_EVENTS } from '@/events';
import { getRideSummaries, loadRide } from '@/utils/ride-storage';
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
    setSummaries(getRideSummaries());
  }, []);

  // Load summaries on mount
  useEffect(() => {
    refreshSummaries();
  }, [refreshSummaries]);

  // Listen for recording stop to refresh the list
  useEffect(() => {
    const handleStop = () => refreshSummaries();

    window.addEventListener(MAP_EVENTS.RIDE_RECORDING_STOP, handleStop);
    return () => {
      window.removeEventListener(MAP_EVENTS.RIDE_RECORDING_STOP, handleStop);
    };
  }, [refreshSummaries]);

  // Load full ride when selected
  useEffect(() => {
    if (selectedRideId) {
      const ride = loadRide(selectedRideId);
      setSelectedRide(ride);
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
      <div className="ride-empty-state">
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
    </div>
  );
}

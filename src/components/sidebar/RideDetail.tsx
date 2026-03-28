'use client';

import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faDownload,
  faTrash,
  faChevronLeft,
  faPencilAlt,
  faCheck,
} from '@fortawesome/free-solid-svg-icons';
import type { RecordedRide } from '@/data/ride';
import { MAP_EVENTS } from '@/events';
import { buildRideGpx } from '@/utils/gpx';
import { deleteRide, renameRide } from '@/utils/ride-storage';
import {
  formatDuration,
  formatDistance,
  formatSpeed,
  formatElevation,
} from '@/utils/format';
import { slugify } from '@/utils/string';

interface RideDetailProps {
  ride: RecordedRide;
  onClose: () => void;
  onDeleted: () => void;
}

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function RideDetail({ ride, onClose, onDeleted }: RideDetailProps) {
  const [editing, setEditing] = useState(false);
  const [nameInput, setNameInput] = useState(ride.name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [currentName, setCurrentName] = useState(ride.name);

  const handleRename = () => {
    const trimmed = nameInput.trim();
    if (trimmed && trimmed !== currentName) {
      renameRide(ride.id, trimmed);
      setCurrentName(trimmed);
    }
    setEditing(false);
  };

  const handleExportGpx = () => {
    const gpx = buildRideGpx({ name: currentName, points: ride.points });
    downloadFile(gpx, `${slugify(currentName)}.gpx`, 'application/gpx+xml');
  };

  const handleDelete = () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    deleteRide(ride.id);
    window.dispatchEvent(new CustomEvent(MAP_EVENTS.RIDE_DESELECT));
    onDeleted();
  };

  const handleClose = () => {
    window.dispatchEvent(new CustomEvent(MAP_EVENTS.RIDE_DESELECT));
    onClose();
  };

  const date = new Date(ride.startTime).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const time = new Date(ride.startTime).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });

  const { stats } = ride;

  return (
    <div className="ride-detail">
      <div
        className="ride-detail-back"
        onClick={handleClose}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleClose();
          }
        }}
        role="button"
        tabIndex={0}
      >
        <FontAwesomeIcon icon={faChevronLeft} />
        <span>Back</span>
      </div>

      <div className="ride-detail-header">
        {editing ? (
          <div className="ride-detail-name-edit">
            <input
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRename();
                if (e.key === 'Escape') setEditing(false);
              }}
              autoFocus
            />
            <button
              type="button"
              onClick={handleRename}
              className="ride-detail-icon-btn"
            >
              <FontAwesomeIcon icon={faCheck} />
            </button>
          </div>
        ) : (
          <div className="ride-detail-name">
            <span>{currentName}</span>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="ride-detail-icon-btn"
            >
              <FontAwesomeIcon icon={faPencilAlt} />
            </button>
          </div>
        )}
      </div>

      <div className="ride-detail-date">
        {date} at {time}
      </div>

      <div className="ride-detail-stats">
        <div className="ride-stat">
          <span className="ride-stat-value">
            {formatDistance(stats.distance)}
          </span>
          <span className="ride-stat-label">Distance</span>
        </div>
        <div className="ride-stat">
          <span className="ride-stat-value">
            {formatDuration(stats.elapsedTime)}
          </span>
          <span className="ride-stat-label">Time</span>
        </div>
        <div className="ride-stat">
          <span className="ride-stat-value">{formatSpeed(stats.avgSpeed)}</span>
          <span className="ride-stat-label">Avg Speed</span>
        </div>
        <div className="ride-stat">
          <span className="ride-stat-value">{formatSpeed(stats.maxSpeed)}</span>
          <span className="ride-stat-label">Max Speed</span>
        </div>
        <div className="ride-stat">
          <span className="ride-stat-value">
            {formatElevation(stats.elevationGain)}
          </span>
          <span className="ride-stat-label">Climbing</span>
        </div>
        <div className="ride-stat">
          <span className="ride-stat-value">
            {formatDuration(stats.movingTime)}
          </span>
          <span className="ride-stat-label">Moving</span>
        </div>
      </div>

      <div className="ride-detail-actions">
        <button
          type="button"
          className="ride-action-btn ride-action-export"
          onClick={handleExportGpx}
        >
          <FontAwesomeIcon icon={faDownload} /> Export GPX
        </button>
        <button
          type="button"
          className={`ride-action-btn ride-action-delete ${confirmDelete ? 'confirming' : ''}`}
          onClick={handleDelete}
        >
          <FontAwesomeIcon icon={faTrash} />{' '}
          {confirmDelete ? 'Confirm Delete' : 'Delete'}
        </button>
      </div>
    </div>
  );
}

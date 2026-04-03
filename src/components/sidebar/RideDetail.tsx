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
import { cn } from '@/lib/utils';
import { buildRideGpx } from '@/utils/gpx';
import { deleteRide, renameRide } from '@/utils/ride-storage';
import {
  downloadFile,
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

export function RideDetail({ ride, onClose, onDeleted }: RideDetailProps) {
  const [editing, setEditing] = useState(false);
  const [nameInput, setNameInput] = useState(ride.name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [currentName, setCurrentName] = useState(ride.name);

  const handleRename = () => {
    const trimmed = nameInput.trim();
    if (trimmed && trimmed !== currentName) {
      renameRide(ride.id, trimmed).catch(() => {});
      setCurrentName(trimmed);
    }
    setEditing(false);
  };

  const handleExportGpx = () => {
    const gpx = buildRideGpx({ name: currentName, points: ride.points });
    downloadFile(gpx, `${slugify(currentName)}.gpx`, 'application/gpx+xml');
  };

  const handleDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    await deleteRide(ride.id).catch(() => {});
    onDeleted();
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
    <div className="p-3">
      <button
        type="button"
        className="flex items-center gap-1.5 text-[13px] text-blue-500 cursor-pointer mb-2.5 py-2 px-1 -ml-1 bg-transparent border-none hover:text-blue-600"
        onClick={onClose}
      >
        <FontAwesomeIcon icon={faChevronLeft} />
        <span>Back</span>
      </button>

      <div className="flex items-center justify-between gap-2 mb-1">
        {editing ? (
          <div className="flex items-center gap-1.5 flex-1">
            <input
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRename();
                if (e.key === 'Escape') setEditing(false);
              }}
              autoFocus
              className="flex-1 text-sm font-semibold px-1.5 py-0.5 border border-gray-200 rounded outline-none min-w-0 focus:border-blue-500"
            />
            <IconButton onClick={handleRename} icon={faCheck} />
          </div>
        ) : (
          <div className="flex items-center gap-1.5 font-semibold text-sm flex-1 min-w-0">
            <span className="overflow-hidden text-ellipsis whitespace-nowrap">
              {currentName}
            </span>
            <IconButton onClick={() => setEditing(true)} icon={faPencilAlt} />
          </div>
        )}
      </div>

      <div className="text-xs text-gray-500 mb-3">
        {date} at {time}
      </div>

      <div className="grid grid-cols-3 gap-2 mb-3">
        <Stat value={formatDistance(stats.distance)} label="Distance" />
        <Stat value={formatDuration(stats.elapsedTime)} label="Time" />
        <Stat value={formatSpeed(stats.avgSpeed)} label="Avg Speed" />
        <Stat value={formatSpeed(stats.maxSpeed)} label="Max Speed" />
        <Stat value={formatElevation(stats.elevationGain)} label="Climbing" />
        <Stat value={formatDuration(stats.movingTime)} label="Moving" />
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          className="flex-1 py-1.5 px-2.5 border border-gray-200 rounded-md bg-white cursor-pointer text-xs font-medium flex items-center justify-center gap-1 transition-colors hover:bg-blue-50 hover:border-blue-500 hover:text-blue-600"
          onClick={handleExportGpx}
        >
          <FontAwesomeIcon icon={faDownload} /> Export GPX
        </button>
        <button
          type="button"
          className={cn(
            'flex-1 py-1.5 px-2.5 border border-gray-200 rounded-md bg-white cursor-pointer text-xs font-medium flex items-center justify-center gap-1 transition-colors',
            confirmDelete
              ? 'bg-red-500 text-white border-red-500'
              : 'hover:bg-red-100 hover:border-red-500 hover:text-red-500',
          )}
          onClick={handleDelete}
        >
          <FontAwesomeIcon icon={faTrash} />{' '}
          {confirmDelete ? 'Confirm Delete' : 'Delete'}
        </button>
      </div>
    </div>
  );
}

function IconButton({
  onClick,
  icon,
}: {
  onClick: () => void;
  icon: typeof faCheck;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="bg-transparent border-none cursor-pointer text-gray-500 p-1 text-[13px] leading-none rounded hover:text-gray-700 hover:bg-gray-100"
    >
      <FontAwesomeIcon icon={icon} />
    </button>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col items-center text-center">
      <span className="text-sm font-semibold text-gray-700">{value}</span>
      <span className="text-[11px] text-gray-500 mt-px">{label}</span>
    </div>
  );
}

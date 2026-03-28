// Shared formatting utilities for ride data display

export const METERS_PER_MILE = 1609.344;
export const FEET_PER_METER = 3.28084;
const MPH_PER_MPS = 2.23694;

export function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0)
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function formatDuration(ms: number): string {
  return formatElapsed(Math.floor(ms / 1000));
}

export function formatDurationShort(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function formatDistance(meters: number): string {
  return `${(meters / METERS_PER_MILE).toFixed(1)} mi`;
}

export function formatSpeed(mps: number): string {
  return `${(mps * MPH_PER_MPS).toFixed(1)} mph`;
}

export function formatElevation(meters: number): string {
  return `${Math.round(meters * FEET_PER_METER)} ft`;
}

export function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

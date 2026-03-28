// Ride recording data types and helpers

// Full point — used during recording (not persisted)
export interface RidePoint {
  lng: number;
  lat: number;
  altitude: number | null; // meters, from coords.altitude
  accuracy: number; // meters, from coords.accuracy
  speed: number | null; // m/s, from coords.speed
  timestamp: number; // Unix ms
}

// Slim point — persisted to storage (accuracy/speed dropped after stats computed)
export interface StoredRidePoint {
  lng: number;
  lat: number;
  altitude: number | null;
  timestamp: number;
}

export interface RideStats {
  distance: number; // meters
  elapsedTime: number; // ms
  movingTime: number; // ms (excluding stops)
  avgSpeed: number; // m/s (distance / movingTime)
  maxSpeed: number; // m/s
  elevationGain: number; // meters
  elevationLoss: number; // meters
  elevationMin: number; // meters
  elevationMax: number; // meters
}

export interface RecordedRide {
  id: string;
  name: string;
  startTime: number; // Unix ms
  endTime: number; // Unix ms
  points: StoredRidePoint[];
  stats: RideStats;
  bounds: [number, number, number, number]; // [swLng, swLat, neLng, neLat]
}

export interface RideSummary {
  id: string;
  name: string;
  startTime: number;
  stats: RideStats;
}

export const RIDES_INDEX_KEY = 'recorded-ride-ids';

export function rideStorageKey(id: string): string {
  return `ride-${id}`;
}

export function generateRideName(startTime: number): string {
  const d = new Date(startTime);
  const date = d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const time = d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
  return `Ride on ${date} at ${time}`;
}

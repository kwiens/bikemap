import { IconDefinition } from '@fortawesome/free-solid-svg-icons';
import { faBicycle } from '@fortawesome/free-solid-svg-icons';

// GBFS Station Information Types
export interface GBFSStation {
  station_id: string;
  name: string;
  lat: number;
  lon: number;
  address?: string;
  capacity: number;
  rental_methods: string[];
  groups?: string[];
  is_charging_station?: boolean;
}

export interface GBFSStationStatus {
  station_id: string;
  num_bikes_available: number;
  num_docks_available: number;
  is_installed: boolean;
  is_renting: boolean;
  is_returning: boolean;
  last_reported: number;
}

export interface GBFSResponse<T> {
  last_updated: number;
  ttl: number;
  data: {
    stations: T[];
  };
}

// Convert GBFS station to our BikeRentalLocation format
export function gbfsToBikeRentalLocation(station: GBFSStation, status?: GBFSStationStatus): BikeRentalLocation {
  return {
    name: station.name,
    description: `Bike share station with ${station.capacity} docks${station.is_charging_station ? ' and charging capabilities' : ''}`,
    address: station.address || `${station.lat}, ${station.lon}`,
    latitude: station.lat,
    longitude: station.lon,
    icon: faBicycle,
    rentalType: 'Bike Share Station',
    price: 'Pay per ride',
    hours: '24/7',
    capacity: station.capacity,
    availableBikes: status?.num_bikes_available,
    availableDocks: status?.num_docks_available,
    isChargingStation: station.is_charging_station || false
  };
}

// Fetch station information from GBFS API
export async function fetchStationInformation(): Promise<GBFSStation[]> {
  const response = await fetch('https://chattanooga.publicbikesystem.net/customer/ube/gbfs/v1/en/station_information');
  if (!response.ok) {
    throw new Error('Failed to fetch station information');
  }
  const data: GBFSResponse<GBFSStation> = await response.json();
  return data.data.stations;
}

// Fetch station status from GBFS API
export async function fetchStationStatus(): Promise<GBFSStationStatus[]> {
  const response = await fetch('https://chattanooga.publicbikesystem.net/customer/ube/gbfs/v1/en/station_status');
  if (!response.ok) {
    throw new Error('Failed to fetch station status');
  }
  const data: GBFSResponse<GBFSStationStatus> = await response.json();
  return data.data.stations;
}

// Extended BikeRentalLocation interface with GBFS-specific fields
export interface BikeRentalLocation {
  name: string;
  description: string;
  address: string;
  latitude: number;
  longitude: number;
  icon: IconDefinition;
  rentalType: string;
  price: string;
  hours: string;
  capacity: number;
  availableBikes?: number;
  availableDocks?: number;
  isChargingStation: boolean;
} 
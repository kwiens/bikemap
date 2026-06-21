import type { IconDefinition } from '@fortawesome/free-solid-svg-icons';
import { faBicycle } from '@fortawesome/free-solid-svg-icons';
import { mapConfig, type GBFSConfig } from '@/config/map.config';

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

export interface GBFSStationResponse<T> {
  last_updated: number;
  ttl: number;
  data: {
    stations: T[];
  };
}

export interface GBFSFreeBike {
  bike_id: string;
  lat: number;
  lon: number;
  is_reserved: boolean;
  is_disabled: boolean;
  rental_uris?: {
    android?: string;
    ios?: string;
    web?: string;
  };
  vehicle_type_id?: string;
  pricing_plan_id?: string;
  current_range_meters?: number;
}

export interface GBFSFreeBikeResponse {
  last_updated: number;
  ttl: number;
  data: {
    bikes: GBFSFreeBike[];
  };
}

// Backward-compatible test/type alias.
export type GBFSResponse<T> = GBFSStationResponse<T>;

function gbfsEndpointUrl(gbfs: GBFSConfig, endpoint: string): string {
  const path = gbfs.endpoints[endpoint as keyof typeof gbfs.endpoints] as
    | string
    | undefined;

  if (!path) {
    throw new Error(`GBFS endpoint "${endpoint}" is not configured`);
  }

  return `${gbfs.baseUrl}${path}`;
}

function configuredGBFS(gbfs: GBFSConfig | undefined): GBFSConfig {
  if (!gbfs) {
    throw new Error(
      `GBFS is not configured for ${mapConfig.region.displayName}`,
    );
  }
  return gbfs;
}

// Convert GBFS station to our BikeRentalLocation format
export function gbfsToBikeRentalLocation(
  station: GBFSStation,
  status?: GBFSStationStatus,
): BikeRentalLocation {
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
    isChargingStation: station.is_charging_station || false,
  };
}

function vehicleNumber(bike: GBFSFreeBike): string {
  const uri = bike.rental_uris?.ios ?? bike.rental_uris?.android;
  if (!uri) return bike.bike_id.slice(0, 8);

  try {
    const url = new URL(uri);
    return url.searchParams.get('number') ?? bike.bike_id.slice(0, 8);
  } catch {
    return bike.bike_id.slice(0, 8);
  }
}

export function gbfsFreeBikeToBikeRentalLocation(
  bike: GBFSFreeBike,
  providerName = 'Shared vehicle',
): BikeRentalLocation {
  const number = vehicleNumber(bike);
  const rangeMiles =
    typeof bike.current_range_meters === 'number'
      ? Math.round((bike.current_range_meters / 1609.344) * 10) / 10
      : null;

  return {
    name: `${providerName} ${number}`,
    description:
      rangeMiles === null
        ? `${providerName} shared vehicle available nearby.`
        : `${providerName} shared vehicle available nearby with about ${rangeMiles} miles of range.`,
    address: `${bike.lat}, ${bike.lon}`,
    latitude: bike.lat,
    longitude: bike.lon,
    icon: faBicycle,
    rentalType: 'Shared Vehicle',
    price: 'Use Veo app',
    hours: 'When available',
    capacity: 1,
    isChargingStation: false,
    vehicleTypeId: bike.vehicle_type_id,
    pricingPlanId: bike.pricing_plan_id,
    currentRangeMeters: bike.current_range_meters,
  };
}

// Fetch station information from GBFS API
export async function fetchStationInformation(
  gbfs: GBFSConfig | undefined = mapConfig.gbfs,
): Promise<GBFSStation[]> {
  const response = await fetch(
    gbfsEndpointUrl(configuredGBFS(gbfs), 'stationInformation'),
  );
  if (!response.ok) {
    throw new Error('Failed to fetch station information');
  }
  const data: GBFSStationResponse<GBFSStation> = await response.json();
  return data.data.stations;
}

// Fetch station status from GBFS API
export async function fetchStationStatus(
  gbfs: GBFSConfig | undefined = mapConfig.gbfs,
): Promise<GBFSStationStatus[]> {
  const response = await fetch(
    gbfsEndpointUrl(configuredGBFS(gbfs), 'stationStatus'),
  );
  if (!response.ok) {
    throw new Error('Failed to fetch station status');
  }
  const data: GBFSStationResponse<GBFSStationStatus> = await response.json();
  return data.data.stations;
}

export async function fetchFreeBikeStatus(
  gbfs: GBFSConfig | undefined = mapConfig.gbfs,
): Promise<GBFSFreeBike[]> {
  const response = await fetch(
    gbfsEndpointUrl(configuredGBFS(gbfs), 'freeBikeStatus'),
  );
  if (!response.ok) {
    throw new Error('Failed to fetch free bike status');
  }
  const data: GBFSFreeBikeResponse = await response.json();
  return data.data.bikes;
}

// Fetch GBFS data and convert it to our BikeRentalLocation shape. This is the
// single source of truth shared by the map markers and the sidebar list.
export async function fetchBikeRentalLocations(
  gbfs: GBFSConfig | undefined = mapConfig.gbfs,
): Promise<BikeRentalLocation[]> {
  if (!gbfs) {
    return [];
  }

  if (gbfs.type === 'station') {
    const [stations, statuses] = await Promise.all([
      fetchStationInformation(gbfs),
      fetchStationStatus(gbfs),
    ]);

    const statusMap = new Map(
      statuses.map((status) => [status.station_id, status]),
    );

    return stations.map((station) =>
      gbfsToBikeRentalLocation(station, statusMap.get(station.station_id)),
    );
  }

  const bikes = await fetchFreeBikeStatus(gbfs);
  return bikes
    .filter((bike) => !bike.is_disabled && !bike.is_reserved)
    .map((bike) => gbfsFreeBikeToBikeRentalLocation(bike, gbfs.providerName));
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
  vehicleTypeId?: string;
  pricingPlanId?: string;
  currentRangeMeters?: number;
}

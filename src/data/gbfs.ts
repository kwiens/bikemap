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

// A vehicle_type entry from the GBFS `vehicle_types` feed. Lets us turn an
// opaque `vehicle_type_id` (e.g. "3") into a human label (e.g. "E-bike").
export interface GBFSVehicleType {
  vehicle_type_id: string;
  form_factor: string; // 'bicycle' | 'scooter' | 'car' | ...
  propulsion_type: string; // 'human' | 'electric_assist' | 'electric' | ...
  max_range_meters?: number;
  name?: string;
}

export interface GBFSVehicleTypesResponse {
  last_updated: number;
  ttl: number;
  data: {
    vehicle_types: GBFSVehicleType[];
  };
}

// A plan from the GBFS `system_pricing_plans` feed. Lets us turn an opaque
// `pricing_plan_id` into a real price string (e.g. "$1 to unlock + $0.39/min").
export interface GBFSPricingPlan {
  plan_id: string;
  name?: string;
  currency?: string;
  price: number;
  per_min_pricing?: Array<{ start: number; rate: number; interval: number }>;
}

export interface GBFSPricingPlansResponse {
  last_updated: number;
  ttl: number;
  data: {
    plans: GBFSPricingPlan[];
  };
}

// Resolved lookups passed into the free-bike converter so each vehicle can be
// labeled with its real type and price instead of opaque ids.
export interface FreeBikeLookups {
  vehicleTypes?: Map<string, GBFSVehicleType>;
  pricingPlans?: Map<string, GBFSPricingPlan>;
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

// Only allow web links we can safely place in an href. The deep link comes from
// the third-party GBFS feed, so reject non-http(s) schemes (e.g. `javascript:`)
// that would otherwise execute when the popup link is clicked.
function isSafeHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

// Best deep link to open the provider's app for a specific vehicle, or undefined
// when the feed offers no safe http(s) link.
function rentalDeepLink(bike: GBFSFreeBike): string | undefined {
  const uri =
    bike.rental_uris?.web ?? bike.rental_uris?.ios ?? bike.rental_uris?.android;
  return uri && isSafeHttpUrl(uri) ? uri : undefined;
}

// Human-friendly label for a vehicle type, derived from its form factor and
// propulsion. Falls back to a generic label when the type is unknown.
export function vehicleTypeLabel(type?: GBFSVehicleType): string {
  if (!type) return 'Shared vehicle';
  const electric =
    type.propulsion_type === 'electric' ||
    type.propulsion_type === 'electric_assist';
  if (type.form_factor === 'scooter') return electric ? 'E-scooter' : 'Scooter';
  if (type.form_factor === 'bicycle') return electric ? 'E-bike' : 'Bike';
  return 'Shared vehicle';
}

// Intl.NumberFormat construction is comparatively expensive and pricing is
// resolved per vehicle, so cache one formatter per (currency, fraction-digits).
const currencyFormatters = new Map<string, Intl.NumberFormat>();

function formatCurrency(amount: number, currency = 'USD'): string {
  // Drop trailing cents on whole amounts ("$1") but keep them otherwise
  // ("$1.50", "$0.39") — never show a single-digit "$1.5".
  const minimumFractionDigits = Number.isInteger(amount) ? 0 : 2;
  const key = `${currency}:${minimumFractionDigits}`;

  let formatter = currencyFormatters.get(key);
  if (!formatter) {
    try {
      formatter = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency,
        minimumFractionDigits,
        maximumFractionDigits: 2,
      });
    } catch {
      return `$${amount.toFixed(2)}`;
    }
    currencyFormatters.set(key, formatter);
  }
  return formatter.format(amount);
}

// "$1 to unlock + $0.39/min" from a pricing plan. Returns null when there's
// nothing meaningful to show.
export function formatPricingPlan(plan?: GBFSPricingPlan): string | null {
  if (!plan) return null;
  const parts: string[] = [];
  if (typeof plan.price === 'number' && plan.price > 0) {
    parts.push(`${formatCurrency(plan.price, plan.currency)} to unlock`);
  }
  // Skip any free intro tier (rate 0) and surface the lowest-start tier that
  // charges (GBFS doesn't guarantee tier ordering); show the billing interval
  // when it isn't a single minute.
  const perMin = (plan.per_min_pricing ?? [])
    .filter((tier) => tier.rate > 0)
    .sort((a, b) => a.start - b.start)[0];
  if (perMin) {
    const unit =
      !perMin.interval || perMin.interval === 1
        ? '/min'
        : ` per ${perMin.interval} min`;
    parts.push(`${formatCurrency(perMin.rate, plan.currency)}${unit}`);
  }
  return parts.length > 0 ? parts.join(' + ') : null;
}

export function gbfsFreeBikeToBikeRentalLocation(
  bike: GBFSFreeBike,
  providerName = 'Shared vehicle',
  lookups?: FreeBikeLookups,
): BikeRentalLocation {
  const vehicleType = bike.vehicle_type_id
    ? lookups?.vehicleTypes?.get(bike.vehicle_type_id)
    : undefined;
  const pricingPlan = bike.pricing_plan_id
    ? lookups?.pricingPlans?.get(bike.pricing_plan_id)
    : undefined;

  const typeLabel = vehicleTypeLabel(vehicleType);
  const price = formatPricingPlan(pricingPlan) ?? `Use ${providerName} app`;

  return {
    name: `${providerName} ${typeLabel.toLowerCase()}`,
    // Range is surfaced as its own popup line, so keep the description short.
    description: `Dockless ${typeLabel.toLowerCase()} available nearby.`,
    address: `${bike.lat}, ${bike.lon}`,
    latitude: bike.lat,
    longitude: bike.lon,
    icon: faBicycle,
    rentalType: typeLabel,
    price,
    hours: 'Available now',
    capacity: 1,
    isChargingStation: false,
    vehicleTypeId: bike.vehicle_type_id,
    pricingPlanId: bike.pricing_plan_id,
    currentRangeMeters: bike.current_range_meters,
    rentalUrl: rentalDeepLink(bike),
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

export async function fetchVehicleTypes(
  gbfs: GBFSConfig | undefined = mapConfig.gbfs,
): Promise<GBFSVehicleType[]> {
  const response = await fetch(
    gbfsEndpointUrl(configuredGBFS(gbfs), 'vehicleTypes'),
  );
  if (!response.ok) {
    throw new Error('Failed to fetch vehicle types');
  }
  const data: GBFSVehicleTypesResponse = await response.json();
  return data.data?.vehicle_types ?? [];
}

export async function fetchPricingPlans(
  gbfs: GBFSConfig | undefined = mapConfig.gbfs,
): Promise<GBFSPricingPlan[]> {
  const response = await fetch(
    gbfsEndpointUrl(configuredGBFS(gbfs), 'systemPricingPlans'),
  );
  if (!response.ok) {
    throw new Error('Failed to fetch pricing plans');
  }
  const data: GBFSPricingPlansResponse = await response.json();
  return data.data?.plans ?? [];
}

// Fetch the optional vehicle_types + system_pricing_plans feeds and build id
// lookups. These feeds are nice-to-have enrichment, so a failure to load them
// degrades gracefully to empty lookups (vehicles fall back to generic labels)
// rather than failing the whole rentals fetch.
async function fetchFreeBikeLookups(
  gbfs: Extract<GBFSConfig, { type: 'freeBike' }>,
): Promise<FreeBikeLookups> {
  const [types, plans] = await Promise.all([
    fetchVehicleTypes(gbfs).catch(() => [] as GBFSVehicleType[]),
    fetchPricingPlans(gbfs).catch(() => [] as GBFSPricingPlan[]),
  ]);

  return {
    vehicleTypes: new Map(types.map((t) => [t.vehicle_type_id, t])),
    pricingPlans: new Map(plans.map((p) => [p.plan_id, p])),
  };
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

  const [bikes, lookups] = await Promise.all([
    fetchFreeBikeStatus(gbfs),
    fetchFreeBikeLookups(gbfs),
  ]);

  return bikes
    .filter((bike) => !bike.is_disabled && !bike.is_reserved)
    .map((bike) =>
      gbfsFreeBikeToBikeRentalLocation(bike, gbfs.providerName, lookups),
    );
}

// Summary of a fleet of dockless vehicles, for the sidebar's collapsed view.
export interface BikeRentalSummary {
  total: number;
  byType: Array<{ label: string; count: number }>;
  price: string | null;
  centroid: { latitude: number; longitude: number } | null;
  // [[minLng, minLat], [maxLng, maxLat]] enclosing the fleet, for fit-to-bounds.
  bounds: [[number, number], [number, number]] | null;
}

// Aggregate a list of dockless vehicles into counts-by-type, a shared price (if
// every vehicle quotes the same one), and the geographic centroid + bounds.
// Used when one summary card replaces a long per-vehicle list.
export function summarizeBikeRentals(
  locations: BikeRentalLocation[],
): BikeRentalSummary {
  const typeCounts = new Map<string, number>();
  const prices = new Set<string>();
  let latSum = 0;
  let lonSum = 0;
  let minLat = Infinity;
  let minLon = Infinity;
  let maxLat = -Infinity;
  let maxLon = -Infinity;

  for (const loc of locations) {
    typeCounts.set(loc.rentalType, (typeCounts.get(loc.rentalType) ?? 0) + 1);
    prices.add(loc.price);
    latSum += loc.latitude;
    lonSum += loc.longitude;
    minLat = Math.min(minLat, loc.latitude);
    minLon = Math.min(minLon, loc.longitude);
    maxLat = Math.max(maxLat, loc.latitude);
    maxLon = Math.max(maxLon, loc.longitude);
  }

  const byType = [...typeCounts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);

  // Only advertise a price when the whole fleet shares one — a single value
  // across mixed pricing would be misleading (and arbitrary on ties).
  const sharedPrice = prices.size === 1 ? [...prices][0] : null;

  return {
    total: locations.length,
    byType,
    price: sharedPrice,
    centroid:
      locations.length > 0
        ? {
            latitude: latSum / locations.length,
            longitude: lonSum / locations.length,
          }
        : null,
    bounds:
      locations.length > 0
        ? [
            [minLon, minLat],
            [maxLon, maxLat],
          ]
        : null,
  };
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
  // Deep link to the provider app to rent this specific vehicle (dockless only).
  rentalUrl?: string;
}

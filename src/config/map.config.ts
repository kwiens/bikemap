import type { CityId } from '@/data/cities/types';

// Centralized map configuration
// This file contains geo-specific settings for each supported city. A fork can
// still replace the active config export, while this app can switch cities by
// setting NEXT_PUBLIC_CITY_ID or by mapping production hostnames with
// NEXT_PUBLIC_CITY_HOST_MAP.

interface StationGBFSConfig {
  type: 'station';
  providerName: string;
  baseUrl: string;
  endpoints: {
    stationInformation: string;
    stationStatus: string;
  };
}

interface FreeBikeGBFSConfig {
  type: 'freeBike';
  providerName: string;
  baseUrl: string;
  endpoints: {
    systemInformation: string;
    freeBikeStatus: string;
    vehicleTypes: string;
    systemPricingPlans: string;
  };
}

export type GBFSConfig = StationGBFSConfig | FreeBikeGBFSConfig;

export interface MapConfig {
  cityId: CityId;

  // Mapbox settings
  mapbox: {
    accessToken: string;
    styleUrl: string;
  };

  // Default map view
  defaultView: {
    center: [number, number]; // [longitude, latitude]
    zoom: number;
    pitch: number;
    bearing: number;
  };

  // GBFS (General Bikeshare Feed Specification) API settings
  gbfs?: GBFSConfig;

  // Region metadata
  region: {
    name: string;
    displayName: string;
    stateCode: string;
    stateName: string;
  };

  // Debug/development settings
  debug: {
    showLocationTracker: boolean;
    simulateLocation: boolean;
  };
}

// The upstream Open Bike Map style. Its `composite` source merges Mapbox's own
// tilesets with private `swuller.*` ones, so **only a token on that account can
// render it** — every other token gets a 404 for the whole composite, which
// silently blanks the entire basemap while runtime-attached sources (GeoJSON
// overlays, the OSM trails tileset) keep drawing. The symptom is a map showing
// trails floating on nothing.
//
// A fork therefore needs its own style: set NEXT_PUBLIC_MAPBOX_STYLE_URL.
const DEFAULT_STYLE_URL = 'mapbox://styles/swuller/cm91zy289001p01qu4cdsdcgt';

const styleUrl = process.env.NEXT_PUBLIC_MAPBOX_STYLE_URL || DEFAULT_STYLE_URL;

// Chattanooga configuration
const chattanoogaConfig: MapConfig = {
  cityId: 'chattanooga',

  mapbox: {
    // Public (pk.*) Mapbox token — set NEXT_PUBLIC_MAPBOX_TOKEN in .env.local
    // and in your host's environment for production. See .env.example.
    accessToken: process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? '',
    styleUrl,
  },

  defaultView: {
    center: [-85.306739, 35.059623], // Outdoor Chattanooga
    zoom: 14.89,
    pitch: -22.4,
    bearing: 11,
  },

  gbfs: {
    type: 'station',
    providerName: 'Bike Chattanooga',
    baseUrl: 'https://chattanooga.publicbikesystem.net/customer/ube/gbfs/v1/en',
    endpoints: {
      stationInformation: '/station_information',
      stationStatus: '/station_status',
    },
  },

  region: {
    name: 'chattanooga',
    displayName: 'Chattanooga',
    stateCode: 'TN',
    stateName: 'Tennessee',
  },

  debug: {
    showLocationTracker: true,
    simulateLocation: false,
  },
};

const bendConfig: MapConfig = {
  cityId: 'bend',

  mapbox: {
    accessToken: process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? '',
    styleUrl,
  },

  defaultView: {
    center: [-121.3153, 44.0582],
    zoom: 13,
    pitch: 0,
    bearing: 0,
  },

  gbfs: {
    type: 'freeBike',
    providerName: 'Veo',
    baseUrl: 'https://cluster-prod.veoride.com/api/shares/name/bnd/gbfs',
    endpoints: {
      systemInformation: '/system_information',
      freeBikeStatus: '/free_bike_status',
      vehicleTypes: '/vehicle_types',
      systemPricingPlans: '/system_pricing_plans',
    },
  },

  region: {
    name: 'bend',
    displayName: 'Bend',
    stateCode: 'OR',
    stateName: 'Oregon',
  },

  debug: {
    showLocationTracker: true,
    simulateLocation: false,
  },
};

export const cityConfigs: Record<CityId, MapConfig> = {
  chattanooga: chattanoogaConfig,
  bend: bendConfig,
};

const DEFAULT_CITY_ID: CityId = 'chattanooga';

/**
 * Every supported city id, in registry order. Derived from `cityConfigs` so a
 * new city is one edit: anything that validates or lists cities — API routes,
 * scripts — reads this rather than repeating the literals.
 */
export const cityIds: CityId[] = Object.keys(cityConfigs) as CityId[];

/** Narrows arbitrary input (a query param, a CLI flag) to a supported city. */
export function isCityId(value: unknown): value is CityId {
  return typeof value === 'string' && Object.hasOwn(cityConfigs, value);
}

export function parseCityId(value: string | undefined): CityId {
  return isCityId(value) ? value : DEFAULT_CITY_ID;
}

export function cityIdForHostname(
  hostname: string | undefined,
  hostMapRaw = process.env.NEXT_PUBLIC_CITY_HOST_MAP,
): CityId | undefined {
  if (!hostname || !hostMapRaw) {
    return undefined;
  }

  let hostMap: Record<string, string>;
  try {
    hostMap = JSON.parse(hostMapRaw) as Record<string, string>;
  } catch {
    console.warn('NEXT_PUBLIC_CITY_HOST_MAP must be a JSON object.');
    return undefined;
  }

  const normalizedHostname = normalizeHostname(hostname);
  return parseCityIdOrUndefined(hostMap[normalizedHostname]);
}

export function resolveActiveCityId(hostname?: string): CityId {
  return (
    cityIdForHostname(hostname ?? getBrowserHostname()) ??
    parseCityId(process.env.NEXT_PUBLIC_CITY_ID)
  );
}

function parseCityIdOrUndefined(value: string | undefined): CityId | undefined {
  return isCityId(value) ? value : undefined;
}

function getBrowserHostname(): string | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }
  return window.location.hostname;
}

function normalizeHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '');
}

// Resolved once at module load, from the browser's hostname when there is one.
// There is no window on the server, so on any server surface this is the env
// default city and nothing else: code that must honour host routing has to
// resolve from the request itself, via `resolveActiveCityId(hostname)` or
// `mapConfigForHostname(hostname)`.
export const activeCityId = resolveActiveCityId();

// Export the active configuration. A fork can swap this for its own MapConfig,
// while this app can select one of the stored city configs via env.
export const mapConfig = cityConfigs[activeCityId];

export function mapConfigForHostname(hostname: string | undefined): MapConfig {
  return cityConfigs[resolveActiveCityId(hostname)];
}

// Helper to get full GBFS endpoint URLs
export function getGBFSUrl(endpoint: string): string {
  if (!mapConfig.gbfs) {
    throw new Error(
      `GBFS is not configured for ${mapConfig.region.displayName}`,
    );
  }

  const path = mapConfig.gbfs.endpoints[
    endpoint as keyof typeof mapConfig.gbfs.endpoints
  ] as string | undefined;

  if (!path) {
    throw new Error(
      `GBFS endpoint "${endpoint}" is not configured for ${mapConfig.region.displayName}`,
    );
  }

  return `${mapConfig.gbfs.baseUrl}${path}`;
}

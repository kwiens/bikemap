import type { CityId } from '@/data/cities/types';

// Centralized map configuration
// This file contains geo-specific settings for each supported city. A fork can
// still replace the active config export, while this app can switch cities by
// setting NEXT_PUBLIC_CITY_ID.

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

// Chattanooga configuration
const chattanoogaConfig: MapConfig = {
  cityId: 'chattanooga',

  mapbox: {
    // Public (pk.*) Mapbox token — set NEXT_PUBLIC_MAPBOX_TOKEN in .env.local
    // and in your host's environment for production. See .env.example.
    accessToken: process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? '',
    styleUrl: 'mapbox://styles/swuller/cm91zy289001p01qu4cdsdcgt',
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
    styleUrl: 'mapbox://styles/swuller/cm91zy289001p01qu4cdsdcgt',
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

function parseCityId(value: string | undefined): CityId {
  if (value === 'bend' || value === 'chattanooga') {
    return value;
  }
  return 'chattanooga';
}

export const activeCityId = parseCityId(process.env.NEXT_PUBLIC_CITY_ID);

// Export the active configuration. A fork can swap this for its own MapConfig,
// while this app can select one of the stored city configs via env.
export const mapConfig = cityConfigs[activeCityId];

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

// Centralized map configuration
// This file contains all geo-specific settings to support multiple geographies in the future

export interface MapConfig {
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
  gbfs: {
    baseUrl: string;
    endpoints: {
      stationInformation: string;
      stationStatus: string;
    };
  };

  // Region metadata
  region: {
    name: string;
    displayName: string;
  };

  // Debug/development settings
  debug: {
    showLocationTracker: boolean;
    simulateLocation: boolean;
  };
}

// Chattanooga configuration
const chattanoogaConfig: MapConfig = {
  mapbox: {
    accessToken:
      'pk.eyJ1Ijoic3d1bGxlciIsImEiOiJjbThyZTVuMzEwMTZwMmpvdTRzM3JpMGlhIn0.CF5lzLSkkfO-c0qt6a168A',
    styleUrl: 'mapbox://styles/swuller/cm91zy289001p01qu4cdsdcgt',
  },

  defaultView: {
    center: [-85.306739, 35.059623], // Outdoor Chattanooga
    zoom: 14.89,
    pitch: -22.4,
    bearing: 11,
  },

  gbfs: {
    baseUrl: 'https://chattanooga.publicbikesystem.net/customer/ube/gbfs/v1/en',
    endpoints: {
      stationInformation: '/station_information',
      stationStatus: '/station_status',
    },
  },

  region: {
    name: 'chattanooga',
    displayName: 'Chattanooga',
  },

  debug: {
    showLocationTracker: true,
    simulateLocation: false,
  },
};

// Export the active configuration
// In the future, this could be selected based on environment variable or URL
export const mapConfig = chattanoogaConfig;

// Helper to get full GBFS endpoint URLs
export function getGBFSUrl(
  endpoint: keyof MapConfig['gbfs']['endpoints'],
): string {
  return `${mapConfig.gbfs.baseUrl}${mapConfig.gbfs.endpoints[endpoint]}`;
}

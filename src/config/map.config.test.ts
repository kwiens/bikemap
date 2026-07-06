import { describe, it, expect } from 'vitest';
import {
  cityConfigs,
  cityIdForHostname,
  getGBFSUrl,
  mapConfig,
  parseCityId,
  resolveActiveCityId,
} from './map.config';

describe('map.config', () => {
  describe('mapConfig', () => {
    it('should have valid mapbox configuration', () => {
      // accessToken is sourced from NEXT_PUBLIC_MAPBOX_TOKEN at runtime, so it
      // is an empty string when the env var is unset (e.g. in CI/tests).
      expect(typeof mapConfig.mapbox.accessToken).toBe('string');
      expect(mapConfig.mapbox.styleUrl).toBeDefined();
      expect(mapConfig.mapbox.styleUrl).toMatch(/^mapbox:\/\/styles\//);
    });

    it('should have valid default view settings', () => {
      expect(mapConfig.defaultView.center).toHaveLength(2);
      expect(mapConfig.defaultView.center[0]).toBeGreaterThanOrEqual(-180);
      expect(mapConfig.defaultView.center[0]).toBeLessThanOrEqual(180);
      expect(mapConfig.defaultView.center[1]).toBeGreaterThanOrEqual(-90);
      expect(mapConfig.defaultView.center[1]).toBeLessThanOrEqual(90);
      expect(mapConfig.defaultView.zoom).toBeGreaterThan(0);
      expect(typeof mapConfig.defaultView.pitch).toBe('number');
      expect(typeof mapConfig.defaultView.bearing).toBe('number');
    });

    it('should have valid GBFS configuration', () => {
      expect(mapConfig.gbfs).toBeDefined();
      if (!mapConfig.gbfs) return;

      expect(mapConfig.gbfs.baseUrl).toBeDefined();
      expect(mapConfig.gbfs.baseUrl).toMatch(/^https?:\/\//);
      expect(Object.keys(mapConfig.gbfs.endpoints).length).toBeGreaterThan(0);
    });

    it('should have valid region metadata', () => {
      expect(mapConfig.region.name).toBeDefined();
      expect(mapConfig.region.displayName).toBeDefined();
    });

    it('should have debug settings', () => {
      expect(typeof mapConfig.debug.showLocationTracker).toBe('boolean');
    });
  });

  describe('getGBFSUrl', () => {
    it('should return full URL for stationInformation', () => {
      expect(mapConfig.gbfs?.type).toBe('station');
      if (mapConfig.gbfs?.type !== 'station') return;

      const url = getGBFSUrl('stationInformation');
      expect(url).toBe(
        `${mapConfig.gbfs.baseUrl}${mapConfig.gbfs.endpoints.stationInformation}`,
      );
      expect(url).toContain('station_information');
    });

    it('should return full URL for stationStatus', () => {
      expect(mapConfig.gbfs?.type).toBe('station');
      if (mapConfig.gbfs?.type !== 'station') return;

      const url = getGBFSUrl('stationStatus');
      expect(url).toBe(
        `${mapConfig.gbfs.baseUrl}${mapConfig.gbfs.endpoints.stationStatus}`,
      );
      expect(url).toContain('station_status');
    });
  });

  describe('cityConfigs', () => {
    it('stores Chattanooga as a station-based GBFS city', () => {
      const config = cityConfigs.chattanooga;
      expect(config.cityId).toBe('chattanooga');
      expect(config.region.stateCode).toBe('TN');
      expect(config.gbfs?.type).toBe('station');
      if (config.gbfs?.type !== 'station') return;
      expect(config.gbfs.endpoints.stationInformation).toBeDefined();
      expect(config.gbfs.endpoints.stationStatus).toBeDefined();
    });

    it('stores Bend as a dockless/free-bike GBFS city', () => {
      const config = cityConfigs.bend;
      expect(config.cityId).toBe('bend');
      expect(config.region.stateCode).toBe('OR');
      expect(config.defaultView.center).toEqual([-121.3153, 44.0582]);
      expect(config.gbfs?.type).toBe('freeBike');
      if (config.gbfs?.type !== 'freeBike') return;
      expect(config.gbfs.baseUrl).toBe(
        'https://cluster-prod.veoride.com/api/shares/name/bnd/gbfs',
      );
      expect(config.gbfs.endpoints.freeBikeStatus).toBe('/free_bike_status');
    });
  });

  describe('city selection', () => {
    const hostMap = JSON.stringify({
      'bikechatt.com': 'chattanooga',
      'www.bikechatt.com': 'chattanooga',
      'ridebend.org': 'bend',
      'www.ridebend.org': 'bend',
    });

    it('uses the explicit city id fallback', () => {
      expect(parseCityId('bend')).toBe('bend');
      expect(parseCityId('chattanooga')).toBe('chattanooga');
      expect(parseCityId(undefined)).toBe('chattanooga');
      expect(parseCityId('not-a-city')).toBe('chattanooga');
    });

    it('maps production hostnames to city ids', () => {
      expect(cityIdForHostname('ridebend.org', hostMap)).toBe('bend');
      expect(cityIdForHostname('www.ridebend.org', hostMap)).toBe('bend');
      expect(cityIdForHostname('bikechatt.com', hostMap)).toBe('chattanooga');
    });

    it('normalizes hostnames before lookup', () => {
      expect(cityIdForHostname('RIDEBEND.ORG:443', hostMap)).toBe('bend');
      expect(cityIdForHostname('www.bikechatt.com.', hostMap)).toBe(
        'chattanooga',
      );
    });

    it('falls back when the hostname is not mapped', () => {
      const previousCityId = process.env.NEXT_PUBLIC_CITY_ID;
      const previousHostMap = process.env.NEXT_PUBLIC_CITY_HOST_MAP;
      process.env.NEXT_PUBLIC_CITY_ID = 'bend';
      delete process.env.NEXT_PUBLIC_CITY_HOST_MAP;

      try {
        expect(resolveActiveCityId('localhost')).toBe('bend');
      } finally {
        restoreEnv('NEXT_PUBLIC_CITY_ID', previousCityId);
        restoreEnv('NEXT_PUBLIC_CITY_HOST_MAP', previousHostMap);
      }
    });
  });
});

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
}

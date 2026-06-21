import { describe, it, expect } from 'vitest';
import { cityConfigs, mapConfig, getGBFSUrl } from './map.config';

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
});

import { describe, it, expect } from 'vitest';
import { mapConfig, getGBFSUrl } from './map.config';

describe('map.config', () => {
  describe('mapConfig', () => {
    it('should have valid mapbox configuration', () => {
      expect(mapConfig.mapbox.accessToken).toBeDefined();
      expect(mapConfig.mapbox.accessToken).toMatch(/^pk\./);
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
      expect(mapConfig.gbfs.baseUrl).toBeDefined();
      expect(mapConfig.gbfs.baseUrl).toMatch(/^https?:\/\//);
      expect(mapConfig.gbfs.endpoints.stationInformation).toBeDefined();
      expect(mapConfig.gbfs.endpoints.stationStatus).toBeDefined();
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
      const url = getGBFSUrl('stationInformation');
      expect(url).toBe(
        `${mapConfig.gbfs.baseUrl}${mapConfig.gbfs.endpoints.stationInformation}`,
      );
      expect(url).toContain('station_information');
    });

    it('should return full URL for stationStatus', () => {
      const url = getGBFSUrl('stationStatus');
      expect(url).toBe(
        `${mapConfig.gbfs.baseUrl}${mapConfig.gbfs.endpoints.stationStatus}`,
      );
      expect(url).toContain('station_status');
    });
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fetchStationInformation,
  fetchStationStatus,
  gbfsToBikeRentalLocation,
  type GBFSStation,
  type GBFSStationStatus,
  type GBFSResponse,
} from './gbfs';
import { faBicycle } from '@fortawesome/free-solid-svg-icons';

describe('GBFS API Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('fetchStationInformation', () => {
    it('should fetch and return station information successfully', async () => {
      const mockStations: GBFSStation[] = [
        {
          station_id: '1',
          name: 'Test Station 1',
          lat: 35.0456,
          lon: -85.3097,
          capacity: 10,
          rental_methods: ['creditcard', 'key'],
        },
        {
          station_id: '2',
          name: 'Test Station 2',
          lat: 35.0556,
          lon: -85.3197,
          address: '123 Main St',
          capacity: 15,
          rental_methods: ['creditcard'],
          is_charging_station: true,
        },
      ];

      const mockResponse: GBFSResponse<GBFSStation> = {
        last_updated: Date.now(),
        ttl: 300,
        data: {
          stations: mockStations,
        },
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await fetchStationInformation();

      expect(global.fetch).toHaveBeenCalledWith(
        'https://chattanooga.publicbikesystem.net/customer/ube/gbfs/v1/en/station_information',
      );
      expect(result).toEqual(mockStations);
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Test Station 1');
    });

    it('should throw error when fetch fails', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      });

      await expect(fetchStationInformation()).rejects.toThrow(
        'Failed to fetch station information',
      );
    });

    it('should throw error when network request fails', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      await expect(fetchStationInformation()).rejects.toThrow('Network error');
    });

    it('should throw error on malformed API response', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ invalid: 'data' }),
      });

      await expect(fetchStationInformation()).rejects.toThrow();
    });
  });

  describe('fetchStationStatus', () => {
    it('should fetch and return station status successfully', async () => {
      const mockStatuses: GBFSStationStatus[] = [
        {
          station_id: '1',
          num_bikes_available: 5,
          num_docks_available: 5,
          is_installed: true,
          is_renting: true,
          is_returning: true,
          last_reported: Date.now(),
        },
        {
          station_id: '2',
          num_bikes_available: 0,
          num_docks_available: 15,
          is_installed: true,
          is_renting: false,
          is_returning: true,
          last_reported: Date.now(),
        },
      ];

      const mockResponse: GBFSResponse<GBFSStationStatus> = {
        last_updated: Date.now(),
        ttl: 60,
        data: {
          stations: mockStatuses,
        },
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await fetchStationStatus();

      expect(global.fetch).toHaveBeenCalledWith(
        'https://chattanooga.publicbikesystem.net/customer/ube/gbfs/v1/en/station_status',
      );
      expect(result).toEqual(mockStatuses);
      expect(result).toHaveLength(2);
      expect(result[0].num_bikes_available).toBe(5);
    });

    it('should throw error when fetch fails', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      });

      await expect(fetchStationStatus()).rejects.toThrow(
        'Failed to fetch station status',
      );
    });

    it('should handle timeout scenarios', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Request timeout'));

      await expect(fetchStationStatus()).rejects.toThrow('Request timeout');
    });
  });

  describe('gbfsToBikeRentalLocation', () => {
    it('should convert GBFS station to BikeRentalLocation without status', () => {
      const station: GBFSStation = {
        station_id: '1',
        name: 'Downtown Station',
        lat: 35.0456,
        lon: -85.3097,
        address: '100 Main St, Chattanooga, TN',
        capacity: 20,
        rental_methods: ['creditcard', 'key'],
        is_charging_station: false,
      };

      const result = gbfsToBikeRentalLocation(station);

      expect(result).toEqual({
        name: 'Downtown Station',
        description: 'Bike share station with 20 docks',
        address: '100 Main St, Chattanooga, TN',
        latitude: 35.0456,
        longitude: -85.3097,
        icon: faBicycle,
        rentalType: 'Bike Share Station',
        price: 'Pay per ride',
        hours: '24/7',
        capacity: 20,
        availableBikes: undefined,
        availableDocks: undefined,
        isChargingStation: false,
      });
    });

    it('should convert GBFS station with status', () => {
      const station: GBFSStation = {
        station_id: '2',
        name: 'Park Station',
        lat: 35.0556,
        lon: -85.3197,
        capacity: 15,
        rental_methods: ['creditcard'],
        is_charging_station: true,
      };

      const status: GBFSStationStatus = {
        station_id: '2',
        num_bikes_available: 7,
        num_docks_available: 8,
        is_installed: true,
        is_renting: true,
        is_returning: true,
        last_reported: Date.now(),
      };

      const result = gbfsToBikeRentalLocation(station, status);

      expect(result).toEqual({
        name: 'Park Station',
        description:
          'Bike share station with 15 docks and charging capabilities',
        address: '35.0556, -85.3197',
        latitude: 35.0556,
        longitude: -85.3197,
        icon: faBicycle,
        rentalType: 'Bike Share Station',
        price: 'Pay per ride',
        hours: '24/7',
        capacity: 15,
        availableBikes: 7,
        availableDocks: 8,
        isChargingStation: true,
      });
    });

    it('should handle station without address', () => {
      const station: GBFSStation = {
        station_id: '3',
        name: 'No Address Station',
        lat: 35.123,
        lon: -85.456,
        capacity: 10,
        rental_methods: ['creditcard'],
      };

      const result = gbfsToBikeRentalLocation(station);

      expect(result.address).toBe('35.123, -85.456');
    });

    it('should handle charging station flag correctly', () => {
      const stationWithCharging: GBFSStation = {
        station_id: '4',
        name: 'Charging Station',
        lat: 35.0,
        lon: -85.0,
        capacity: 10,
        rental_methods: ['creditcard'],
        is_charging_station: true,
      };

      const stationWithoutCharging: GBFSStation = {
        station_id: '5',
        name: 'Regular Station',
        lat: 35.1,
        lon: -85.1,
        capacity: 10,
        rental_methods: ['creditcard'],
      };

      const resultWith = gbfsToBikeRentalLocation(stationWithCharging);
      const resultWithout = gbfsToBikeRentalLocation(stationWithoutCharging);

      expect(resultWith.isChargingStation).toBe(true);
      expect(resultWith.description).toContain('charging capabilities');
      expect(resultWithout.isChargingStation).toBe(false);
      expect(resultWithout.description).not.toContain('charging capabilities');
    });

    it('should handle empty status gracefully', () => {
      const station: GBFSStation = {
        station_id: '6',
        name: 'Test Station',
        lat: 35.0,
        lon: -85.0,
        capacity: 10,
        rental_methods: ['creditcard'],
      };

      const result = gbfsToBikeRentalLocation(station, undefined);

      expect(result.availableBikes).toBeUndefined();
      expect(result.availableDocks).toBeUndefined();
    });
  });

  describe('GBFS API integration tests', () => {
    it('should handle complete flow of fetching and converting stations', async () => {
      const mockStations: GBFSStation[] = [
        {
          station_id: '1',
          name: 'Station 1',
          lat: 35.0456,
          lon: -85.3097,
          capacity: 10,
          rental_methods: ['creditcard'],
        },
      ];

      const mockStatuses: GBFSStationStatus[] = [
        {
          station_id: '1',
          num_bikes_available: 5,
          num_docks_available: 5,
          is_installed: true,
          is_renting: true,
          is_returning: true,
          last_reported: Date.now(),
        },
      ];

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            last_updated: Date.now(),
            ttl: 300,
            data: { stations: mockStations },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            last_updated: Date.now(),
            ttl: 60,
            data: { stations: mockStatuses },
          }),
        });

      const stations = await fetchStationInformation();
      const statuses = await fetchStationStatus();

      const statusMap: { [key: string]: GBFSStationStatus } = {};
      statuses.forEach((status) => {
        statusMap[status.station_id] = status;
      });

      const rentalLocations = stations.map((station) =>
        gbfsToBikeRentalLocation(station, statusMap[station.station_id]),
      );

      expect(rentalLocations).toHaveLength(1);
      expect(rentalLocations[0].name).toBe('Station 1');
      expect(rentalLocations[0].availableBikes).toBe(5);
      expect(rentalLocations[0].availableDocks).toBe(5);
    });
  });
});

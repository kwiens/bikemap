import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fetchBikeRentalLocations,
  fetchStationInformation,
  fetchStationStatus,
  formatPricingPlan,
  gbfsFreeBikeToBikeRentalLocation,
  gbfsToBikeRentalLocation,
  summarizeBikeRentals,
  vehicleTypeLabel,
  type FreeBikeLookups,
  type GBFSFreeBike,
  type GBFSPricingPlan,
  type GBFSStation,
  type GBFSStationStatus,
  type GBFSResponse,
  type GBFSVehicleType,
} from './gbfs';
import { faBicycle } from '@fortawesome/free-solid-svg-icons';
import { cityConfigs } from '@/config/map.config';

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

  describe('gbfsFreeBikeToBikeRentalLocation', () => {
    it('should convert a dockless vehicle to a BikeRentalLocation', () => {
      const bike: GBFSFreeBike = {
        bike_id: '6e702198-66c1-5b85-9fe7-b52a866925a5',
        lat: 44.022414,
        lon: -121.268237,
        is_reserved: false,
        is_disabled: false,
        rental_uris: {
          ios: 'https://gmjc.adj.st/?adj_t=5vyf0nr&number=1014956',
        },
        vehicle_type_id: '3',
        pricing_plan_id: '296',
        current_range_meters: 45293,
      };

      const result = gbfsFreeBikeToBikeRentalLocation(bike, 'Veo');

      expect(result).toEqual({
        name: 'Veo shared vehicle',
        description: 'Dockless shared vehicle available nearby.',
        address: '44.022414, -121.268237',
        latitude: 44.022414,
        longitude: -121.268237,
        icon: faBicycle,
        rentalType: 'Shared vehicle',
        price: 'Use Veo app',
        hours: 'Available now',
        capacity: 1,
        isChargingStation: false,
        vehicleTypeId: '3',
        pricingPlanId: '296',
        currentRangeMeters: 45293,
        rentalUrl: 'https://gmjc.adj.st/?adj_t=5vyf0nr&number=1014956',
      });
    });

    it('should enrich the vehicle with resolved type, price, and deep link', () => {
      const bike: GBFSFreeBike = {
        bike_id: '6e702198-66c1-5b85-9fe7-b52a866925a5',
        lat: 44.022414,
        lon: -121.268237,
        is_reserved: false,
        is_disabled: false,
        rental_uris: {
          ios: 'https://gmjc.adj.st/?adj_t=5vyf0nr&number=1014956',
        },
        vehicle_type_id: '3',
        pricing_plan_id: '296',
        current_range_meters: 45293,
      };

      const lookups: FreeBikeLookups = {
        vehicleTypes: new Map<string, GBFSVehicleType>([
          [
            '3',
            {
              vehicle_type_id: '3',
              form_factor: 'bicycle',
              propulsion_type: 'electric',
            },
          ],
        ]),
        pricingPlans: new Map<string, GBFSPricingPlan>([
          [
            '296',
            {
              plan_id: '296',
              currency: 'USD',
              price: 1,
              per_min_pricing: [{ start: 0, rate: 0.39, interval: 1 }],
            },
          ],
        ]),
      };

      const result = gbfsFreeBikeToBikeRentalLocation(bike, 'Veo', lookups);

      expect(result.name).toBe('Veo e-bike');
      expect(result.rentalType).toBe('E-bike');
      expect(result.price).toBe('$1 to unlock + $0.39/min');
      expect(result.description).toBe('Dockless e-bike available nearby.');
      expect(result.rentalUrl).toBe(
        'https://gmjc.adj.st/?adj_t=5vyf0nr&number=1014956',
      );
    });
  });

  describe('vehicleTypeLabel', () => {
    it('labels electric and human-powered form factors', () => {
      expect(
        vehicleTypeLabel({
          vehicle_type_id: '3',
          form_factor: 'bicycle',
          propulsion_type: 'electric',
        }),
      ).toBe('E-bike');
      expect(
        vehicleTypeLabel({
          vehicle_type_id: '0',
          form_factor: 'bicycle',
          propulsion_type: 'human',
        }),
      ).toBe('Bike');
      expect(
        vehicleTypeLabel({
          vehicle_type_id: '1',
          form_factor: 'scooter',
          propulsion_type: 'electric',
        }),
      ).toBe('E-scooter');
      expect(vehicleTypeLabel(undefined)).toBe('Shared vehicle');
    });
  });

  describe('formatPricingPlan', () => {
    it('formats unlock fee plus per-minute rate', () => {
      expect(
        formatPricingPlan({
          plan_id: '296',
          currency: 'USD',
          price: 1,
          per_min_pricing: [{ start: 0, rate: 0.39, interval: 1 }],
        }),
      ).toBe('$1 to unlock + $0.39/min');
    });

    it('keeps cents on non-whole amounts but drops them on whole dollars', () => {
      expect(
        formatPricingPlan({
          plan_id: 'p',
          currency: 'USD',
          price: 1.5,
          per_min_pricing: [{ start: 0, rate: 0.4, interval: 1 }],
        }),
      ).toBe('$1.50 to unlock + $0.40/min');
    });

    it('skips a free intro tier and surfaces the first paid per-minute rate', () => {
      expect(
        formatPricingPlan({
          plan_id: 'p',
          currency: 'USD',
          price: 1,
          per_min_pricing: [
            { start: 0, rate: 0, interval: 1 },
            { start: 5, rate: 0.39, interval: 1 },
          ],
        }),
      ).toBe('$1 to unlock + $0.39/min');
    });

    it('renders the billing interval when it is not a single minute', () => {
      expect(
        formatPricingPlan({
          plan_id: 'p',
          currency: 'USD',
          price: 1,
          per_min_pricing: [{ start: 0, rate: 0.39, interval: 5 }],
        }),
      ).toBe('$1 to unlock + $0.39 per 5 min');
    });

    it('picks the lowest-start paid tier regardless of array order', () => {
      expect(
        formatPricingPlan({
          plan_id: 'p',
          currency: 'USD',
          price: 1,
          per_min_pricing: [
            { start: 60, rate: 0.2, interval: 1 },
            { start: 0, rate: 0.39, interval: 1 },
          ],
        }),
      ).toBe('$1 to unlock + $0.39/min');
    });

    it('returns null when there is nothing to charge', () => {
      expect(formatPricingPlan(undefined)).toBeNull();
      expect(formatPricingPlan({ plan_id: 'x', price: 0 })).toBeNull();
    });
  });

  describe('summarizeBikeRentals', () => {
    const freeBike = (bike_id: string, lat: number, lon: number) =>
      gbfsFreeBikeToBikeRentalLocation(
        { bike_id, lat, lon, is_reserved: false, is_disabled: false },
        'Veo',
      );

    it('aggregates counts by type, shared price, centroid, and bounds', () => {
      const summary = summarizeBikeRentals([
        freeBike('a', 44, -121),
        freeBike('b', 46, -123),
      ]);

      expect(summary.total).toBe(2);
      expect(summary.byType).toEqual([{ label: 'Shared vehicle', count: 2 }]);
      expect(summary.centroid).toEqual({ latitude: 45, longitude: -122 });
      expect(summary.bounds).toEqual([
        [-123, 44],
        [-121, 46],
      ]);
      // Both vehicles share the same (fallback) price string.
      expect(summary.price).toBe('Use Veo app');
    });

    it('reports a null price when the fleet has mixed prices', () => {
      const cheap = freeBike('a', 44, -121);
      const pricey = { ...freeBike('b', 46, -123), price: '$2 to unlock' };

      expect(summarizeBikeRentals([cheap, pricey]).price).toBeNull();
    });

    it('returns null centroid and bounds for an empty fleet', () => {
      const summary = summarizeBikeRentals([]);
      expect(summary.total).toBe(0);
      expect(summary.centroid).toBeNull();
      expect(summary.bounds).toBeNull();
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

    it('should fetch and convert Bend free-bike vehicles', async () => {
      const bendGbfs = cityConfigs.bend.gbfs;
      expect(bendGbfs?.type).toBe('freeBike');
      if (bendGbfs?.type !== 'freeBike') return;

      const availableBike: GBFSFreeBike = {
        bike_id: 'available-bike',
        lat: 44.05,
        lon: -121.31,
        is_reserved: false,
        is_disabled: false,
        rental_uris: {
          ios: 'https://gmjc.adj.st/?adj_t=5vyf0nr&number=1001',
        },
      };
      const disabledBike: GBFSFreeBike = {
        bike_id: 'disabled-bike',
        lat: 44.06,
        lon: -121.32,
        is_reserved: false,
        is_disabled: true,
      };
      const reservedBike: GBFSFreeBike = {
        bike_id: 'reserved-bike',
        lat: 44.07,
        lon: -121.33,
        is_reserved: true,
        is_disabled: false,
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          last_updated: Date.now(),
          ttl: 0,
          data: { bikes: [availableBike, disabledBike, reservedBike] },
        }),
      });

      const rentalLocations = await fetchBikeRentalLocations(bendGbfs);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://cluster-prod.veoride.com/api/shares/name/bnd/gbfs/free_bike_status',
      );
      expect(rentalLocations).toHaveLength(1);
      expect(rentalLocations[0].name).toBe('Veo shared vehicle');
      expect(rentalLocations[0].latitude).toBe(44.05);
      expect(rentalLocations[0].longitude).toBe(-121.31);
      expect(rentalLocations[0].rentalUrl).toBe(
        'https://gmjc.adj.st/?adj_t=5vyf0nr&number=1001',
      );
    });
  });
});

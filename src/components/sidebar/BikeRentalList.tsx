'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import {
  fetchStationInformation,
  fetchStationStatus,
  gbfsToBikeRentalLocation,
  type BikeRentalLocation,
} from '@/data/gbfs';
import { SidebarCard } from './SidebarCard';
import type { BikeRentalListProps } from './types';

export function BikeRentalList({
  show,
  onCenterLocation,
}: BikeRentalListProps) {
  const [rentalLocations, setRentalLocations] = useState<BikeRentalLocation[]>(
    [],
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchRentalLocations = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const [stations, statuses] = await Promise.all([
          fetchStationInformation(),
          fetchStationStatus(),
        ]);

        const statusMap = new Map(
          statuses.map((status) => [status.station_id, status]),
        );
        const locations = stations.map((station) =>
          gbfsToBikeRentalLocation(station, statusMap.get(station.station_id)),
        );
        setRentalLocations(locations);
      } catch (err) {
        setError('Failed to load bike rental locations');
        console.error('Error fetching bike rental data:', err);
      } finally {
        setIsLoading(false);
      }
    };

    if (show) {
      fetchRentalLocations();
    }
  }, [show]);

  return (
    <div className={cn('mb-6', !show && 'hidden')}>
      <h3 className="text-sm font-medium mb-2 text-gray-600">Bike Rentals</h3>
      {isLoading && (
        <div className="p-4 text-center text-gray-500 italic">
          Loading bike rental locations...
        </div>
      )}
      {error && (
        <div className="p-4 text-center text-red-500 font-medium">{error}</div>
      )}
      {!isLoading && !error && (
        <div className="flex flex-col gap-2">
          {rentalLocations.map((location) => (
            <SidebarCard
              key={location.name}
              colorTheme="purple"
              icon={location.icon}
              title={location.name}
              description={location.description}
              onClick={() => onCenterLocation(location)}
              showArrow
            >
              <div className="flex flex-wrap gap-2 mt-2 ml-10 text-xs text-gray-500">
                <span className="bg-gray-200 px-2 py-0.5 rounded text-gray-600">
                  {location.rentalType}
                </span>
                <span className="bg-gray-200 px-2 py-0.5 rounded text-gray-600">
                  {location.price}
                </span>
                <span className="bg-gray-200 px-2 py-0.5 rounded text-gray-600">
                  {location.hours}
                </span>
                {location.availableBikes !== undefined && (
                  <span className="bg-gray-200 px-2 py-0.5 rounded text-gray-600">
                    Bikes: {location.availableBikes}
                  </span>
                )}
                {location.availableDocks !== undefined && (
                  <span className="bg-gray-200 px-2 py-0.5 rounded text-gray-600">
                    Docks: {location.availableDocks}
                  </span>
                )}
                {location.isChargingStation && (
                  <span className="bg-gray-200 px-2 py-0.5 rounded text-gray-600">
                    Charging Available
                  </span>
                )}
              </div>
            </SidebarCard>
          ))}
        </div>
      )}
    </div>
  );
}

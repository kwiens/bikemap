'use client';

import { useState, useEffect, useMemo } from 'react';
import { faBicycle } from '@fortawesome/free-solid-svg-icons';
import { cn } from '@/lib/utils';
import { mapConfig } from '@/config/map.config';
import {
  fetchBikeRentalLocations,
  summarizeBikeRentals,
  type BikeRentalLocation,
} from '@/data/gbfs';
import { SidebarCard } from './SidebarCard';
import type { BikeRentalListProps } from './types';

const BADGE_CLASS = 'bg-gray-200 px-2 py-0.5 rounded text-gray-600';

// Lowercase plural for a vehicle type label, e.g. "E-bike" -> "e-bikes".
function pluralizeType(label: string): string {
  return `${label.toLowerCase()}s`;
}

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
        const locations = await fetchBikeRentalLocations();
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

  // Dockless providers (e.g. Veo) return one record per physical vehicle —
  // often hundreds. Collapse them into a single summary card instead of a long
  // list of serial-numbered cards. Station providers keep the per-station list.
  const isFreeFloating = mapConfig.gbfs?.type === 'freeBike';

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
      {!isLoading && !error && isFreeFloating && rentalLocations.length > 0 && (
        <FreeBikeSummaryCard
          locations={rentalLocations}
          providerName={mapConfig.gbfs?.providerName ?? 'Bike share'}
          onCenterLocation={onCenterLocation}
        />
      )}
      {!isLoading && !error && !isFreeFloating && (
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
                <span className={BADGE_CLASS}>{location.rentalType}</span>
                <span className={BADGE_CLASS}>{location.price}</span>
                <span className={BADGE_CLASS}>{location.hours}</span>
                {location.availableBikes !== undefined && (
                  <span className={BADGE_CLASS}>
                    Bikes: {location.availableBikes}
                  </span>
                )}
                {location.availableDocks !== undefined && (
                  <span className={BADGE_CLASS}>
                    Docks: {location.availableDocks}
                  </span>
                )}
                {location.isChargingStation && (
                  <span className={BADGE_CLASS}>Charging Available</span>
                )}
              </div>
            </SidebarCard>
          ))}
        </div>
      )}
    </div>
  );
}

interface FreeBikeSummaryCardProps {
  locations: BikeRentalLocation[];
  providerName: string;
  onCenterLocation: BikeRentalListProps['onCenterLocation'];
}

function FreeBikeSummaryCard({
  locations,
  providerName,
  onCenterLocation,
}: FreeBikeSummaryCardProps) {
  const summary = useMemo(() => summarizeBikeRentals(locations), [locations]);

  const headline =
    summary.byType.length === 1
      ? `${summary.total} ${pluralizeType(summary.byType[0].label)} available nearby`
      : `${summary.total} vehicles available nearby`;

  const handleClick = () => {
    if (!summary.bounds) return;
    // Fit the map to the whole fleet rather than flying to a single point.
    onCenterLocation({
      name: providerName,
      description: headline,
      bounds: summary.bounds,
    });
  };

  return (
    <SidebarCard
      colorTheme="purple"
      icon={faBicycle}
      title={providerName}
      description={headline}
      onClick={summary.bounds ? handleClick : undefined}
      showArrow={!!summary.bounds}
    >
      <div className="flex flex-wrap gap-2 mt-2 ml-10 text-xs text-gray-500">
        <span className={BADGE_CLASS}>Dockless</span>
        {summary.price && summary.price !== `Use ${providerName} app` && (
          <span className={BADGE_CLASS}>{summary.price}</span>
        )}
        {summary.byType.length > 1 &&
          summary.byType.map((type) => (
            <span key={type.label} className={BADGE_CLASS}>
              {type.count} {pluralizeType(type.label)}
            </span>
          ))}
      </div>
    </SidebarCard>
  );
}

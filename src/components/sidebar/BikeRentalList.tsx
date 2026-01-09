'use client';

import { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faLocationArrow } from '@fortawesome/free-solid-svg-icons';
import {
  fetchStationInformation,
  fetchStationStatus,
  gbfsToBikeRentalLocation,
  type BikeRentalLocation,
} from '@/data/gbfs';
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
    <div className={`section-container ${!show ? 'hidden' : ''}`}>
      <h3 className="section-title">Bike Rentals</h3>
      {isLoading && (
        <div className="loading">Loading bike rental locations...</div>
      )}
      {error && <div className="error">{error}</div>}
      {!isLoading && !error && (
        <div className="section-items">
          {rentalLocations.map((location) => (
            <div
              key={location.name}
              className="card card-purple"
              onClick={() => onCenterLocation(location)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onCenterLocation(location);
                }
              }}
              role="button"
              tabIndex={0}
            >
              <div className="card-header">
                <div className="card-icon-container card-icon-purple">
                  <FontAwesomeIcon
                    icon={location.icon}
                    className="card-icon icon-purple"
                  />
                </div>
                <span className="card-title">{location.name}</span>
              </div>
              <div className="card-description card-description-flex">
                <span className="description-text">{location.description}</span>
                <div className="location-arrow-container-purple">
                  <FontAwesomeIcon
                    icon={faLocationArrow}
                    className="location-arrow-icon"
                  />
                </div>
              </div>
              <div className="card-details">
                <span className="detail-item">{location.rentalType}</span>
                <span className="detail-item">{location.price}</span>
                <span className="detail-item">{location.hours}</span>
                {location.availableBikes !== undefined && (
                  <span className="detail-item">
                    Bikes: {location.availableBikes}
                  </span>
                )}
                {location.availableDocks !== undefined && (
                  <span className="detail-item">
                    Docks: {location.availableDocks}
                  </span>
                )}
                {location.isChargingStation && (
                  <span className="detail-item">Charging Available</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

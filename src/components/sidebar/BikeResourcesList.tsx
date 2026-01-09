import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faLocationArrow } from '@fortawesome/free-solid-svg-icons';
import { bikeResources } from '@/data/geo_data';
import type { BikeResourcesListProps } from './types';

export function BikeResourcesList({
  show,
  onCenterLocation,
}: BikeResourcesListProps) {
  return (
    <div className={`section-container ${!show ? 'hidden' : ''}`}>
      <h3 className="section-title">Bike Resources</h3>
      <div className="section-items">
        {bikeResources.map((location) => (
          <div
            key={location.name}
            className="card card-green"
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
              <div className="card-icon-container card-icon-green">
                <FontAwesomeIcon
                  icon={location.icon}
                  className="card-icon icon-green"
                />
              </div>
              <span className="card-title">{location.name}</span>
            </div>
            <div className="card-description card-description-flex">
              <span className="description-text">{location.description}</span>
              <div className="location-arrow-container-green">
                <FontAwesomeIcon
                  icon={faLocationArrow}
                  className="location-arrow-icon"
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

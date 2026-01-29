import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faLocationArrow } from '@fortawesome/free-solid-svg-icons';
import { mapFeatures } from '@/data/geo_data';
import type { AttractionsListProps } from './types';

export function AttractionsList({
  show,
  onCenterLocation,
}: AttractionsListProps) {
  return (
    <div className={`section-container ${!show ? 'hidden' : ''}`}>
      <h3 className="section-title">Attractions</h3>
      <div className="section-items">
        {mapFeatures.map((location) => (
          <div
            key={location.name}
            className="card"
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
              <div className="card-icon-container card-icon-blue">
                <FontAwesomeIcon
                  icon={location.icon}
                  className="card-icon icon-blue"
                />
              </div>
              <span className="card-title">{location.name}</span>
            </div>
            <div className="card-description card-description-flex">
              <span className="description-text">{location.description}</span>
              <div className="location-arrow-container-blue">
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

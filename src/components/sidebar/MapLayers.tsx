import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMapMarkerAlt, faBicycle } from '@fortawesome/free-solid-svg-icons';
import { ToggleSwitch } from './ToggleSwitch';
import type { MapLayersProps } from './types';

export function MapLayers({
  showAttractions,
  showBikeResources,
  showBikeRentals,
  onToggleAttractions,
  onToggleBikeResources,
  onToggleBikeRentals,
}: MapLayersProps) {
  return (
    <div className="section-container">
      <h3 className="section-title">Map Layers</h3>
      <div className="section-items">
        {/* Attractions Layer Toggle */}
        <div
          onClick={onToggleAttractions}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onToggleAttractions();
            }
          }}
          role="button"
          tabIndex={0}
          className="layer-toggle"
        >
          <div className="card-header">
            <FontAwesomeIcon icon={faMapMarkerAlt} className="layer-icon" />
            <span className="layer-name">Attractions</span>
          </div>
          <ToggleSwitch isActive={showAttractions} />
        </div>

        {/* Bike Resources Layer Toggle */}
        <div
          onClick={onToggleBikeResources}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onToggleBikeResources();
            }
          }}
          role="button"
          tabIndex={0}
          className="layer-toggle"
        >
          <div className="card-header">
            <FontAwesomeIcon icon={faBicycle} className="layer-icon" />
            <span className="layer-name">Bike Resources</span>
          </div>
          <ToggleSwitch isActive={showBikeResources} />
        </div>

        {/* Bike Rentals Layer Toggle */}
        <div
          onClick={onToggleBikeRentals}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onToggleBikeRentals();
            }
          }}
          role="button"
          tabIndex={0}
          className="layer-toggle"
        >
          <div className="card-header">
            <FontAwesomeIcon icon={faBicycle} className="layer-icon" />
            <span className="layer-name">Bike Rentals</span>
          </div>
          <ToggleSwitch isActive={showBikeRentals} />
        </div>
      </div>
    </div>
  );
}

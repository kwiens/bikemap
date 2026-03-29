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
    <div className="mb-6">
      <h3 className="text-sm font-medium mb-2 text-gray-600">Map Layers</h3>
      <div className="flex flex-col gap-2">
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
          className="p-2 rounded cursor-pointer transition-all duration-200 flex items-center justify-between hover:bg-blue-600/5"
        >
          <div className="flex items-center gap-3">
            <FontAwesomeIcon
              icon={faMapMarkerAlt}
              className="w-4 h-4 text-gray-500"
            />
            <span className="font-medium">Attractions</span>
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
          className="p-2 rounded cursor-pointer transition-all duration-200 flex items-center justify-between hover:bg-blue-600/5"
        >
          <div className="flex items-center gap-3">
            <FontAwesomeIcon
              icon={faBicycle}
              className="w-4 h-4 text-gray-500"
            />
            <span className="font-medium">Bike Resources</span>
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
          className="p-2 rounded cursor-pointer transition-all duration-200 flex items-center justify-between hover:bg-blue-600/5"
        >
          <div className="flex items-center gap-3">
            <FontAwesomeIcon
              icon={faBicycle}
              className="w-4 h-4 text-gray-500"
            />
            <span className="font-medium">Bike Rentals</span>
          </div>
          <ToggleSwitch isActive={showBikeRentals} />
        </div>
      </div>
    </div>
  );
}

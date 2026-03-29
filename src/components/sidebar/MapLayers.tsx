import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faMapMarkerAlt,
  faBicycle,
  type IconDefinition,
} from '@fortawesome/free-solid-svg-icons';
import { ToggleSwitch } from './ToggleSwitch';
import type { MapLayersProps } from './types';

const layers: { key: string; icon: IconDefinition; label: string }[] = [
  { key: 'attractions', icon: faMapMarkerAlt, label: 'Attractions' },
  { key: 'bikeResources', icon: faBicycle, label: 'Bike Resources' },
  { key: 'bikeRentals', icon: faBicycle, label: 'Bike Rentals' },
];

export function MapLayers({
  showAttractions,
  showBikeResources,
  showBikeRentals,
  onToggleAttractions,
  onToggleBikeResources,
  onToggleBikeRentals,
}: MapLayersProps) {
  const stateMap: Record<string, boolean> = {
    attractions: showAttractions,
    bikeResources: showBikeResources,
    bikeRentals: showBikeRentals,
  };
  const toggleMap: Record<string, () => void> = {
    attractions: onToggleAttractions,
    bikeResources: onToggleBikeResources,
    bikeRentals: onToggleBikeRentals,
  };

  return (
    <div className="mb-6">
      <h3 className="text-sm font-medium mb-2 text-gray-600">Map Layers</h3>
      <div className="flex flex-col gap-2">
        {layers.map(({ key, icon, label }) => (
          <div
            key={key}
            onClick={toggleMap[key]}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toggleMap[key]();
              }
            }}
            role="button"
            tabIndex={0}
            className="p-2 rounded cursor-pointer transition-all duration-200 flex items-center justify-between hover:bg-blue-600/5"
          >
            <div className="flex items-center gap-3">
              <FontAwesomeIcon icon={icon} className="w-4 h-4 text-gray-500" />
              <span className="font-medium">{label}</span>
            </div>
            <ToggleSwitch isActive={stateMap[key]} />
          </div>
        ))}
      </div>
    </div>
  );
}

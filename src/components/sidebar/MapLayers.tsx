import {
  faMapMarkerAlt,
  faBicycle,
  type IconDefinition,
} from '@fortawesome/free-solid-svg-icons';
import { MapLayersSection, ToggleRow } from './MapLayersSection';
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
    <MapLayersSection>
      {layers.map(({ key, icon, label }) => (
        <ToggleRow
          key={key}
          icon={icon}
          label={label}
          isActive={stateMap[key]}
          onToggle={toggleMap[key]}
        />
      ))}
    </MapLayersSection>
  );
}

import {
  faMapMarkerAlt,
  faBicycle,
  type IconDefinition,
} from '@fortawesome/free-solid-svg-icons';
import { mapConfig } from '@/config/map.config';
import { bikeResources } from '@/data/geo_data';
import { MapLayersSection, ToggleRow } from './MapLayersSection';
import type { MapLayersProps } from './types';

const layers: {
  key: 'attractions' | 'bikeResources' | 'bikeRentals';
  icon: IconDefinition;
  label: string;
}[] = [
  {
    key: 'attractions',
    icon: faMapMarkerAlt,
    label: 'Attractions',
  },
  {
    key: 'bikeResources',
    icon: faBicycle,
    label: 'Bike Resources',
  },
  {
    key: 'bikeRentals',
    icon: faBicycle,
    label: 'Bike Rentals',
  },
];

export function MapLayers({
  hasAttractions,
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
  const enabled = {
    attractions: hasAttractions,
    bikeResources: bikeResources.length > 0,
    bikeRentals: Boolean(mapConfig.gbfs),
  };
  const visibleLayers = layers.filter(({ key }) => enabled[key]);

  if (visibleLayers.length === 0) {
    return null;
  }

  return (
    <MapLayersSection>
      {visibleLayers.map(({ key, icon, label }) => (
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

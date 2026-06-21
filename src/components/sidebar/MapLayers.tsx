import {
  faMapMarkerAlt,
  faBicycle,
  type IconDefinition,
} from '@fortawesome/free-solid-svg-icons';
import { mapConfig } from '@/config/map.config';
import { bikeResources, mapFeatures } from '@/data/geo_data';
import { MapLayersSection, ToggleRow } from './MapLayersSection';
import type { MapLayersProps } from './types';

const layers: {
  key: 'attractions' | 'bikeResources' | 'bikeRentals';
  icon: IconDefinition;
  label: string;
  enabled: boolean;
}[] = [
  {
    key: 'attractions',
    icon: faMapMarkerAlt,
    label: 'Attractions',
    enabled: mapFeatures.length > 0,
  },
  {
    key: 'bikeResources',
    icon: faBicycle,
    label: 'Bike Resources',
    enabled: bikeResources.length > 0,
  },
  {
    key: 'bikeRentals',
    icon: faBicycle,
    label: 'Bike Rentals',
    enabled: Boolean(mapConfig.gbfs),
  },
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
  const visibleLayers = layers.filter((layer) => layer.enabled);

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

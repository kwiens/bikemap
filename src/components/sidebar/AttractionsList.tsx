import { mapFeatures } from '@/data/geo_data';
import { LocationList } from './LocationList';
import type { AttractionsListProps } from './types';

export function AttractionsList({
  show,
  onCenterLocation,
}: AttractionsListProps) {
  return (
    <LocationList
      show={show}
      title="Attractions"
      colorTheme="blue"
      items={mapFeatures}
      getIcon={(location) => location.icon}
      onCenterLocation={onCenterLocation}
    />
  );
}

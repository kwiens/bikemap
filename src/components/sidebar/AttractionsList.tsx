import { attractionIcon } from '@/data/map-features';
import { LocationList } from './LocationList';
import type { AttractionsListProps } from './types';

export function AttractionsList({
  attractions,
  show,
  onCenterLocation,
}: AttractionsListProps) {
  return (
    <LocationList
      show={show}
      title="Attractions"
      colorTheme="blue"
      items={attractions}
      getIcon={(location) => attractionIcon(location.icon)}
      onCenterLocation={onCenterLocation}
    />
  );
}

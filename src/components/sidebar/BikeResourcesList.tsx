import { faBicycle } from '@fortawesome/free-solid-svg-icons';
import { bikeResources } from '@/data/geo_data';
import { LocationList } from './LocationList';
import type { BikeResourcesListProps } from './types';

export function BikeResourcesList({
  show,
  onCenterLocation,
}: BikeResourcesListProps) {
  return (
    <LocationList
      show={show}
      title="Bike Resources"
      colorTheme="green"
      items={bikeResources}
      getIcon={() => faBicycle}
      onCenterLocation={onCenterLocation}
    />
  );
}

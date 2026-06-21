import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';

export interface LocationProps {
  name: string;
  description: string;
  icon?: IconDefinition;
  latitude?: number;
  longitude?: number;
  address?: string;
  // [[minLng, minLat], [maxLng, maxLat]] — when set, the map fits these bounds
  // instead of flying to a single point (used by the dockless fleet summary).
  bounds?: [[number, number], [number, number]];
}

export interface ToggleSwitchProps {
  isActive: boolean;
  color?: string;
}

export interface BikeRoutesProps {
  selectedRoute: string | null;
  onRouteSelect: (routeId: string) => void;
}

export interface MapLayersProps {
  showAttractions: boolean;
  showBikeResources: boolean;
  showBikeRentals: boolean;
  onToggleAttractions: () => void;
  onToggleBikeResources: () => void;
  onToggleBikeRentals: () => void;
}

export interface AttractionsListProps {
  show: boolean;
  onCenterLocation: (location: LocationProps) => void;
}

export interface BikeResourcesListProps {
  show: boolean;
  onCenterLocation: (location: LocationProps) => void;
}

export interface BikeRentalListProps {
  show: boolean;
  onCenterLocation: (location: LocationProps) => void;
}

export interface MountainBikeTrailsProps {
  selectedTrail: string | null;
  onTrailSelect: (trailName: string) => void;
  onAreaSelect: (areaName: string) => void;
}

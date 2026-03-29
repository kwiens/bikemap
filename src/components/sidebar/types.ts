import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';

export interface LocationProps {
  name: string;
  description: string;
  icon: IconDefinition;
  latitude?: number;
  longitude?: number;
  address?: string;
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

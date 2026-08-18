import type { IconDefinition } from '@fortawesome/free-solid-svg-icons';
import { cn } from '@/lib/utils';
import { SidebarCard, type SidebarCardColorTheme } from './SidebarCard';
import type { LocationProps } from './types';

interface LocationListProps<T extends LocationProps> {
  show: boolean;
  title: string;
  colorTheme: SidebarCardColorTheme;
  items: readonly T[];
  getIcon: (item: T) => IconDefinition;
  onCenterLocation: (location: LocationProps) => void;
}

// Shared toggleable list of location cards (used by Attractions and
// Bike Resources). Renders nothing when the item list is empty.
export function LocationList<T extends LocationProps>({
  show,
  title,
  colorTheme,
  items,
  getIcon,
  onCenterLocation,
}: LocationListProps<T>) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className={cn('mb-6', !show && 'hidden')}>
      <h3 className="text-sm font-medium mb-2 text-gray-600">{title}</h3>
      <div className="flex flex-col gap-2">
        {items.map((location) => (
          <SidebarCard
            key={location.name}
            colorTheme={colorTheme}
            icon={getIcon(location)}
            title={location.name}
            description={location.description}
            onClick={() => onCenterLocation(location)}
            showArrow
          />
        ))}
      </div>
    </div>
  );
}

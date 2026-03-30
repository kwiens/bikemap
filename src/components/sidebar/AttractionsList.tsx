import { cn } from '@/lib/utils';
import { mapFeatures } from '@/data/geo_data';
import { SidebarCard } from './SidebarCard';
import type { AttractionsListProps } from './types';

export function AttractionsList({
  show,
  onCenterLocation,
}: AttractionsListProps) {
  return (
    <div className={cn('mb-6', !show && 'hidden')}>
      <h3 className="text-sm font-medium mb-2 text-gray-600">Attractions</h3>
      <div className="flex flex-col gap-2">
        {mapFeatures.map((location) => (
          <SidebarCard
            key={location.name}
            colorTheme="blue"
            icon={location.icon}
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

import React from 'react';
import { cn } from '@/lib/utils';
import { getBikeRoutes } from '@/data/route-source';
import { pressableProps } from './a11y';
import type { BikeRoutesProps } from './types';

export function BikeRoutes({
  selectedRoute,
  onRouteSelect,
  showAllRoutes = false,
}: BikeRoutesProps) {
  const bikeRoutes = getBikeRoutes();
  const visibleRoutes = showAllRoutes
    ? bikeRoutes
    : bikeRoutes.filter(
        (route) => route.featured || route.id === selectedRoute,
      );
  if (visibleRoutes.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2">
      {visibleRoutes.map((route) => (
        <div
          key={route.id}
          {...pressableProps(() => onRouteSelect(route.id))}
          data-selected={selectedRoute === route.id || undefined}
          className={cn(
            'p-2 rounded cursor-pointer transition-all duration-200 border border-transparent',
            selectedRoute === route.id
              ? 'bg-app-primary/15 border-app-primary'
              : 'hover:bg-app-primary/10 hover:border-app-primary',
          )}
        >
          <div className="flex items-start gap-3">
            <div
              aria-hidden="true"
              className="mt-1 size-4 shrink-0 rounded"
              style={{ backgroundColor: route.color }}
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                <span className="min-w-0 break-words font-medium">
                  {route.name}
                </span>
                <span className="ml-auto whitespace-nowrap text-[11px] text-gray-500">
                  {route.distance} mi
                </span>
              </div>
              <div className="mt-1 break-words text-xs text-gray-500">
                {route.description}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

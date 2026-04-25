import React from 'react';
import { cn } from '@/lib/utils';
import { bikeRoutes } from '@/data/geo_data';
import type { BikeRoutesProps } from './types';

export function BikeRoutes({ selectedRoute, onRouteSelect }: BikeRoutesProps) {
  return (
    <div className="flex flex-col gap-2">
      {bikeRoutes.map((route) => (
        <div
          key={route.id}
          onClick={() => onRouteSelect(route.id)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onRouteSelect(route.id);
            }
          }}
          role="button"
          tabIndex={0}
          data-selected={selectedRoute === route.id || undefined}
          className={cn(
            'p-2 rounded cursor-pointer transition-all duration-200 border border-transparent',
            selectedRoute === route.id
              ? 'bg-blue-600/10 border-blue-600'
              : 'hover:bg-blue-600/5 hover:border-blue-500',
          )}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-4 h-4 rounded"
              style={{ backgroundColor: route.color }}
            />
            <span className="font-medium">{route.name}</span>
            {route.distance ? (
              <span className="text-[11px] text-gray-500 ml-auto shrink-0">
                {route.distance} mi
              </span>
            ) : null}
          </div>
          <div className="text-xs text-gray-500 mt-1 ml-7">
            {route.description}
          </div>
        </div>
      ))}
    </div>
  );
}

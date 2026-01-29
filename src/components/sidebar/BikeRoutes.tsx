import React from 'react';
import { bikeRoutes } from '@/data/geo_data';
import type { BikeRoutesProps } from './types';

export function BikeRoutes({ selectedRoute, onRouteSelect }: BikeRoutesProps) {
  return (
    <div className="section-container">
      <h3 className="section-title">Pick a Loop</h3>
      <div className="section-items">
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
            className={`route-item ${selectedRoute === route.id ? 'route-item-selected' : ''}`}
          >
            <div className="card-header">
              <div
                className="route-color-indicator"
                style={{ backgroundColor: route.color }}
              />
              <span className="route-name">{route.name}</span>
            </div>
            <div className="route-description">{route.description}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

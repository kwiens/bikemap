import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BikeRoutes } from './BikeRoutes';

vi.mock('@/data/geo_data', () => ({
  bikeRoutes: [
    {
      id: 'route-1',
      name: 'Test Route 1',
      color: '#FF0000',
      description: 'Description for route 1',
    },
    {
      id: 'route-2',
      name: 'Test Route 2',
      color: '#00FF00',
      description: 'Description for route 2',
    },
  ],
}));

describe('BikeRoutes', () => {
  it('renders all routes with descriptions', () => {
    render(<BikeRoutes selectedRoute={null} onRouteSelect={vi.fn()} />);

    expect(screen.getByText('Test Route 1')).toBeInTheDocument();
    expect(screen.getByText('Test Route 2')).toBeInTheDocument();
    expect(screen.getByText('Description for route 1')).toBeInTheDocument();
    expect(screen.getByText('Description for route 2')).toBeInTheDocument();
  });

  it.each([
    ['click', 'click', {}],
    ['Enter key', 'keyDown', { key: 'Enter' }],
    ['Space key', 'keyDown', { key: ' ' }],
  ])('calls onRouteSelect on %s', (_label, event, eventArgs) => {
    const onRouteSelect = vi.fn();
    render(<BikeRoutes selectedRoute={null} onRouteSelect={onRouteSelect} />);

    const button = screen.getByRole('button', { name: /test route 1/i });
    fireEvent[event as 'click' | 'keyDown'](button, eventArgs);

    expect(onRouteSelect).toHaveBeenCalledWith('route-1');
  });

  it('highlights selected route with data-selected attribute', () => {
    render(<BikeRoutes selectedRoute="route-1" onRouteSelect={vi.fn()} />);

    const route1 = screen.getByRole('button', { name: /test route 1/i });
    const route2 = screen.getByRole('button', { name: /test route 2/i });

    expect(route1).toHaveAttribute('data-selected');
    expect(route2).not.toHaveAttribute('data-selected');
  });
});

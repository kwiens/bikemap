import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BikeRoutes } from './BikeRoutes';

// Mock the geo_data module
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
  it('should render all routes', () => {
    const mockOnRouteSelect = vi.fn();

    render(
      <BikeRoutes selectedRoute={null} onRouteSelect={mockOnRouteSelect} />,
    );

    expect(screen.getByText('Test Route 1')).toBeInTheDocument();
    expect(screen.getByText('Test Route 2')).toBeInTheDocument();
    expect(screen.getByText('Description for route 1')).toBeInTheDocument();
    expect(screen.getByText('Description for route 2')).toBeInTheDocument();
  });

  it('should call onRouteSelect when route is clicked', () => {
    const mockOnRouteSelect = vi.fn();

    render(
      <BikeRoutes selectedRoute={null} onRouteSelect={mockOnRouteSelect} />,
    );

    const route1Button = screen.getByRole('button', {
      name: /test route 1/i,
    });

    fireEvent.click(route1Button);

    expect(mockOnRouteSelect).toHaveBeenCalledWith('route-1');
  });

  it('should call onRouteSelect on Enter key press', () => {
    const mockOnRouteSelect = vi.fn();

    render(
      <BikeRoutes selectedRoute={null} onRouteSelect={mockOnRouteSelect} />,
    );

    const route2Button = screen.getByRole('button', {
      name: /test route 2/i,
    });

    fireEvent.keyDown(route2Button, { key: 'Enter' });

    expect(mockOnRouteSelect).toHaveBeenCalledWith('route-2');
  });

  it('should call onRouteSelect on Space key press', () => {
    const mockOnRouteSelect = vi.fn();

    render(
      <BikeRoutes selectedRoute={null} onRouteSelect={mockOnRouteSelect} />,
    );

    const route1Button = screen.getByRole('button', {
      name: /test route 1/i,
    });

    fireEvent.keyDown(route1Button, { key: ' ' });

    expect(mockOnRouteSelect).toHaveBeenCalledWith('route-1');
  });

  it('should highlight selected route', () => {
    const mockOnRouteSelect = vi.fn();

    render(
      <BikeRoutes selectedRoute="route-1" onRouteSelect={mockOnRouteSelect} />,
    );

    const route1Button = screen.getByRole('button', {
      name: /test route 1/i,
    });
    const route2Button = screen.getByRole('button', {
      name: /test route 2/i,
    });

    expect(route1Button).toHaveAttribute('data-selected');
    expect(route2Button).not.toHaveAttribute('data-selected');
  });
});

/** @vitest-environment jsdom */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BikeRoutes } from './BikeRoutes';

vi.mock('@/data/route-source', () => ({
  getBikeRoutes: () => [
    {
      id: 'route-1',
      name: 'Test Route 1',
      color: '#FF0000',
      description: 'Description for route 1',
      featured: true,
    },
    {
      id: 'route-2',
      name: 'Test Route 2',
      color: '#00FF00',
      description: 'Description for route 2',
      featured: false,
    },
  ],
}));

describe('BikeRoutes', () => {
  it('lists only featured routes on the home menu before selection', () => {
    const mockOnRouteSelect = vi.fn();

    render(
      <BikeRoutes selectedRoute={null} onRouteSelect={mockOnRouteSelect} />,
    );

    expect(screen.getByText('Test Route 1')).toBeInTheDocument();
    expect(screen.queryByText('Test Route 2')).not.toBeInTheDocument();
    expect(screen.getByText('Description for route 1')).toBeInTheDocument();
  });

  it('keeps both routes in the embed menu', () => {
    render(
      <BikeRoutes selectedRoute={null} onRouteSelect={vi.fn()} showAllRoutes />,
    );

    expect(screen.getByText('Test Route 1')).toBeInTheDocument();
    expect(screen.getByText('Test Route 2')).toBeInTheDocument();
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

    const route1Button = screen.getByRole('button', {
      name: /test route 1/i,
    });

    fireEvent.keyDown(route1Button, { key: 'Enter' });

    expect(mockOnRouteSelect).toHaveBeenCalledWith('route-1');
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

  it('shows and highlights an unfeatured route while it is selected', () => {
    const mockOnRouteSelect = vi.fn();

    const { rerender } = render(
      <BikeRoutes selectedRoute="route-2" onRouteSelect={mockOnRouteSelect} />,
    );

    const route1Button = screen.getByRole('button', {
      name: /test route 1/i,
    });
    const route2Button = screen.getByRole('button', {
      name: /test route 2/i,
    });

    expect(route1Button).not.toHaveAttribute('data-selected');
    expect(route2Button).toHaveAttribute('data-selected');

    rerender(
      <BikeRoutes selectedRoute={null} onRouteSelect={mockOnRouteSelect} />,
    );
    expect(route2Button).not.toBeInTheDocument();
  });
});

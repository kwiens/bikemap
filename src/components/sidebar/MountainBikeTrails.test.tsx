import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MountainBikeTrails } from './MountainBikeTrails';
import type { MountainBikeTrailsProps } from './types';

vi.mock('@/data/geo_data', () => ({
  mountainBikeTrails: [
    {
      trailName: 'Trail A',
      displayName: 'Trail A',
      recArea: 'Area 1',
      rating: 'easy',
      color: '#16A34A',
      icon: {},
      distance: 1.5,
      elevationGain: 200,
    },
    {
      trailName: 'Trail B',
      displayName: 'Trail B',
      recArea: 'Area 1',
      rating: 'intermediate',
      color: '#2563EB',
      icon: {},
      distance: 2.0,
      elevationGain: 350,
    },
    {
      trailName: 'Trail C',
      displayName: 'Trail C',
      recArea: 'Area 2',
      rating: 'advanced',
      color: '#374151',
      icon: {},
    },
    {
      trailName: 'Trail D',
      displayName: 'Trail D',
      recArea: 'Area 3',
      rating: '',
      color: '#6B7280',
      icon: {},
    },
  ],
  regionFor: (recArea: string) => {
    if (recArea === 'Area 1' || recArea === 'Area 2') return 'Region 1';
    return 'Region 2';
  },
}));

const defaultProps: MountainBikeTrailsProps = {
  selectedTrail: null,
  onTrailSelect: vi.fn(),
  onAreaSelect: vi.fn(),
};

describe('MountainBikeTrails', () => {
  it('renders region headings', () => {
    render(<MountainBikeTrails {...defaultProps} />);

    expect(screen.getByText('Region 1')).toBeInTheDocument();
    expect(screen.getByText('Region 2')).toBeInTheDocument();
  });

  it('clicking a trail calls onTrailSelect with the trail name', () => {
    const onTrailSelect = vi.fn();
    render(
      <MountainBikeTrails {...defaultProps} onTrailSelect={onTrailSelect} />,
    );

    // Expand Region 2 (has single area Area 3, so Trail D is auto-visible)
    const region2Button = screen.getByRole('button', { name: /Region 2/ });
    fireEvent.click(region2Button);

    const trailDButton = screen.getByRole('button', { name: /Trail D/ });
    fireEvent.click(trailDButton);

    expect(onTrailSelect).toHaveBeenCalledWith('Trail D');
  });

  it('selected trail gets selected styling', () => {
    render(<MountainBikeTrails {...defaultProps} selectedTrail="Trail D" />);

    // selectedTrail auto-expands the region and area, so Trail D should be visible
    const trailDButton = screen.getByRole('button', { name: /Trail D/ });
    expect(trailDButton).toHaveAttribute('data-selected');
  });

  it('non-selected trails get faded when a trail is selected', () => {
    render(<MountainBikeTrails {...defaultProps} selectedTrail="Trail A" />);

    // Trail A is selected, so auto-expand puts Region 1 and Area 1 open
    const trailAButton = screen.getByRole('button', { name: /Trail A/ });
    const trailBButton = screen.getByRole('button', { name: /Trail B/ });

    expect(trailAButton).toHaveAttribute('data-selected');
    expect(trailAButton).not.toHaveAttribute('data-faded');
    expect(trailBButton).toHaveAttribute('data-faded');
    expect(trailBButton).not.toHaveAttribute('data-selected');
  });

  it('clicking region heading calls onAreaSelect', () => {
    const onAreaSelect = vi.fn();
    render(
      <MountainBikeTrails {...defaultProps} onAreaSelect={onAreaSelect} />,
    );

    const region1Button = screen.getByRole('button', { name: /Region 1/ });
    fireEvent.click(region1Button);

    expect(onAreaSelect).toHaveBeenCalledWith('Region 1');
  });

  it.each([
    ['trail name', 'Trail A', 'Trail A', 'Trail B'],
    ['trail name (case insensitive)', 'trail a', 'Trail A', 'Trail B'],
    ['region name', 'Region 2', 'Trail D', 'Trail A'],
    ['rec area name', 'Area 2', 'Trail C', 'Trail A'],
  ])('search matches by %s', (_label, query, expectedVisible, expectedHidden) => {
    render(<MountainBikeTrails {...defaultProps} />);

    const searchInput = screen.getByPlaceholderText('Search trails...');
    fireEvent.change(searchInput, { target: { value: query } });

    expect(screen.getByText(expectedVisible)).toBeInTheDocument();
    expect(screen.queryByText(expectedHidden)).not.toBeInTheDocument();
  });

  it('shows no trails found for unmatched search', () => {
    render(<MountainBikeTrails {...defaultProps} />);

    const searchInput = screen.getByPlaceholderText('Search trails...');
    fireEvent.change(searchInput, { target: { value: 'nonexistent' } });

    expect(screen.getByText('No trails found')).toBeInTheDocument();
  });

  it('empty search shows default grouped view', () => {
    render(<MountainBikeTrails {...defaultProps} />);

    const searchInput = screen.getByPlaceholderText('Search trails...');
    fireEvent.change(searchInput, { target: { value: 'Trail A' } });
    fireEvent.change(searchInput, { target: { value: '' } });

    // Regions should be visible again
    expect(screen.getByText('Region 1')).toBeInTheDocument();
    expect(screen.getByText('Region 2')).toBeInTheDocument();
  });
});

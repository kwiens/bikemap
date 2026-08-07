import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MountainBikeTrails } from './MountainBikeTrails';
import type { ConditionReport } from '@/data/trail-conditions';
import type { MountainBikeTrailsProps } from './types';

/**
 * The badge on a sidebar row, and specifically the staleness rule.
 *
 * The rule is the part worth a test: a report that is shown when it should not
 * be is worse than one that is missing, because someone reads a green pill from
 * last season as today's answer and drives out on it.
 */

vi.mock('@/data/trail-source', () => ({
  getMountainBikeTrails: () => [
    {
      color: '#16A34A',
      displayName: 'Fresh Trail',
      icon: {},
      rating: 'easy',
      recArea: 'Area 1',
      slug: 'fresh-trail',
      trailName: 'Fresh Trail',
    },
    {
      color: '#16A34A',
      displayName: 'Stale Trail',
      icon: {},
      rating: 'easy',
      recArea: 'Area 1',
      slug: 'stale-trail',
      trailName: 'Stale Trail',
    },
    {
      color: '#16A34A',
      displayName: 'Quiet Trail',
      icon: {},
      rating: 'easy',
      recArea: 'Area 1',
      slug: 'quiet-trail',
      trailName: 'Quiet Trail',
    },
  ],
}));

vi.mock('@/data/geo_data', () => ({ regionFor: () => 'Region 1' }));

function report(daysAgo: number, name: string): ConditionReport {
  const observed = new Date();
  observed.setDate(observed.getDate() - daysAgo);
  return {
    color: '#b45309',
    marksClosed: false,
    name,
    observedAt: observed.toISOString(),
    source: 'public',
    value: 'muddy',
  };
}

const latest: Record<string, ConditionReport> = {
  'fresh-trail': report(2, 'Muddy — stay off'),
  // 20 days is past CONDITION_FRESH_DAYS.
  'stale-trail': report(20, 'Dry'),
};

vi.mock('@/components/TrailConditionsProvider', () => ({
  useTrailConditions: () => ({
    latest,
    loading: false,
    options: [],
    recordLocal: vi.fn(),
    refresh: vi.fn(),
  }),
}));

const defaultProps: MountainBikeTrailsProps = {
  onAreaSelect: vi.fn(),
  onTrailSelect: vi.fn(),
  selectedTrail: null,
};

describe('MountainBikeTrails condition badges', () => {
  it('shows a badge for a recent report', () => {
    render(
      <MountainBikeTrails {...defaultProps} selectedTrail="Fresh Trail" />,
    );

    expect(screen.getByText('Muddy — stay off')).toBeInTheDocument();
  });

  it('shows nothing for a report past the freshness cutoff', () => {
    render(
      <MountainBikeTrails {...defaultProps} selectedTrail="Stale Trail" />,
    );

    // Scoped to the row: selecting a trail expands its whole complex, so the
    // other trails' badges are on screen too.
    const row = screen.getByRole('button', { name: /Stale Trail/ });
    expect(within(row).queryByText('Dry')).not.toBeInTheDocument();
  });

  it('shows nothing for a trail nobody has reported on', () => {
    render(
      <MountainBikeTrails {...defaultProps} selectedTrail="Quiet Trail" />,
    );

    const row = screen.getByRole('button', { name: /Quiet Trail/ });
    expect(row).toHaveTextContent('Quiet Trail');
    expect(within(row).queryByText(/Muddy/)).not.toBeInTheDocument();
  });

  it('keys reports by slug, not by display name', () => {
    // `slug` differs from a slugified `trailName` often enough that getting
    // this wrong would silently show every trail no badge at all.
    render(
      <MountainBikeTrails {...defaultProps} selectedTrail="Fresh Trail" />,
    );

    const row = screen.getByRole('button', { name: /Fresh Trail/ });
    expect(row).toHaveTextContent('Muddy — stay off');
  });
});

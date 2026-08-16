import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { setMountainBikeTrails } from '@/data/trail-source';
import type { MountainBikeTrail } from '@/data/mountain-bike-trails';
import { MountainBikeTrails } from './MountainBikeTrails';

/**
 * Regression test for trails arriving *after* this module is imported.
 *
 * The sibling test file mocks `getMountainBikeTrails`, so it passes whether the
 * grouping runs at import time or during render. This one uses the real
 * trail-source and sets trails the way the server does — which is the only way
 * to catch the grouping being computed at module scope, where it captures the
 * checked-in fallback data and never sees a database row.
 */

const props = {
  onAreaSelect: vi.fn(),
  onTrailSelect: vi.fn(),
  selectedTrail: null,
};

function trail(overrides: Partial<MountainBikeTrail>): MountainBikeTrail {
  return {
    color: '#16A34A',
    displayName: 'From Database',
    icon: {} as MountainBikeTrail['icon'],
    rating: 'easy',
    recArea: 'Database Area',
    trailName: 'From Database',
    ...overrides,
  } as MountainBikeTrail;
}

describe('MountainBikeTrails with database trails', () => {
  it('renders the area and region set after the module was imported', () => {
    // Exactly what HomeClient does with the server's props. Two areas, because
    // the sidebar deliberately hides the area heading when a region holds only
    // one — it would just repeat the region.
    setMountainBikeTrails([
      trail({
        displayName: 'One',
        recArea: 'Database Area',
        region: 'Database Region',
        trailName: 'One',
      }),
      trail({
        displayName: 'Two',
        recArea: 'Second Area',
        region: 'Database Region',
        trailName: 'Two',
      }),
    ]);

    render(<MountainBikeTrails {...props} />);

    // The region heading comes from the area's stored region; it would be
    // absent if the grouping had been computed at import time.
    expect(screen.getByText('Database Region')).toBeInTheDocument();

    // Areas sit inside a collapsed region, so expand it to reach them.
    fireEvent.click(screen.getByText('Database Region'));
    expect(screen.getByText('Database Area')).toBeInTheDocument();
    expect(screen.getByText('Second Area')).toBeInTheDocument();
  });

  it('collapses the area heading when a region holds only one', () => {
    // Existing behaviour worth pinning: a lone area heading would just repeat
    // the region above it, so the trails are listed directly.
    setMountainBikeTrails([
      trail({
        displayName: 'Only',
        recArea: 'Lone Area',
        region: 'Lone Region',
        trailName: 'Only',
      }),
    ]);

    render(<MountainBikeTrails {...props} />);
    fireEvent.click(screen.getByText('Lone Region'));

    expect(screen.getByText('Only')).toBeInTheDocument();
    expect(screen.queryByText('Lone Area')).not.toBeInTheDocument();
  });
});

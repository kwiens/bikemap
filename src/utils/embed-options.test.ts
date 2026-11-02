import { describe, expect, it } from 'vitest';
import { faMountain } from '@fortawesome/free-solid-svg-icons';
import type { MountainBikeTrail } from '@/data/mountain-bike-trails';
import { embedBuilderConfig } from './embed-options';

function trail(
  trailName: string,
  displayName: string,
  slug?: string,
): MountainBikeTrail {
  return {
    trailName,
    displayName,
    slug,
    recArea: 'Test Area',
    rating: 'easy',
    color: '#22c55e',
    icon: faMountain,
  };
}

describe('embedBuilderConfig trails', () => {
  it('offers one option per selectable slug', () => {
    const { trails } = embedBuilderConfig(
      undefined,
      [],
      [
        trail('Larry', 'Larry (North)', 'larry'),
        trail('Larry', 'Larry (South)', 'larry'),
        trail('Curly', 'Curly'),
      ],
    );

    expect(trails).toEqual([
      { id: 'larry', name: 'Larry (North)', slug: 'larry' },
      { id: 'curly', name: 'Curly', slug: 'curly' },
    ]);
  });
});

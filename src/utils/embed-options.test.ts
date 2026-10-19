import { describe, expect, it } from 'vitest';
import { faMountain } from '@fortawesome/free-solid-svg-icons';
import type { MountainBikeTrail } from '@/data/mountain-bike-trails';
import { DEFAULT_FEATURE_SETTINGS } from '@/config/features.config';
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

describe('embed feature settings', () => {
  it('excludes disabled marker and network layers', () => {
    const config = embedBuilderConfig('ridebend.org', [], [], undefined, {
      ...DEFAULT_FEATURE_SETTINGS,
      attractions: false,
      bikeNetwork: false,
      bikeRentals: false,
      bikeResources: false,
      casualRoutes: false,
    });
    expect(config.availableLayers).toEqual([]);
    expect(config.casualRoutes).toBe(false);
    expect(config.trails.length).toBeGreaterThan(0);
  });
});

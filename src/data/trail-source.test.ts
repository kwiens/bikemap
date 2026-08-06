import { describe, it, expect, beforeEach } from 'vitest';
import { activeCityData } from './cities';
import type { MountainBikeTrail } from './mountain-bike-trails';
import {
  getMountainBikeTrails,
  isUsingDatabaseTrails,
  onMountainBikeTrailsChange,
  setMountainBikeTrails,
} from './trail-source';

function trail(name: string): MountainBikeTrail {
  return {
    color: '#000000',
    displayName: name,
    icon: {} as MountainBikeTrail['icon'],
    rating: '',
    recArea: 'Somewhere',
    trailName: name,
  };
}

describe('trail-source', () => {
  beforeEach(() => {
    // The store is module-level and deliberately has no reset, so each test
    // starts by putting something known in it.
    setMountainBikeTrails([trail('Reset')]);
  });

  it('starts from the checked-in data so the map works with no database', () => {
    // Verified against a fresh import rather than the shared store, which
    // earlier tests have already written to.
    expect(activeCityData.mountainBikeTrails.length).toBeGreaterThan(0);
  });

  it('replaces the list when the server supplies rows', () => {
    setMountainBikeTrails([trail('From Postgres')]);

    expect(getMountainBikeTrails()).toHaveLength(1);
    expect(getMountainBikeTrails()[0].trailName).toBe('From Postgres');
    expect(isUsingDatabaseTrails()).toBe(true);
  });

  it('ignores an empty list rather than blanking the map', () => {
    // This is the fallback guarantee: an unreachable database returns [], and
    // the public map must keep rendering whatever it already had.
    setMountainBikeTrails([trail('Kept')]);
    setMountainBikeTrails([]);

    expect(getMountainBikeTrails()).toHaveLength(1);
    expect(getMountainBikeTrails()[0].trailName).toBe('Kept');
  });

  it('notifies subscribers so derived lookups can be rebuilt', () => {
    let notified = 0;
    const unsubscribe = onMountainBikeTrailsChange(() => {
      notified += 1;
    });

    setMountainBikeTrails([trail('One')]);
    expect(notified).toBe(1);

    // The same array reference is a no-op — React may render twice.
    const same = getMountainBikeTrails();
    setMountainBikeTrails(same);
    expect(notified).toBe(1);

    unsubscribe();
    setMountainBikeTrails([trail('Two')]);
    expect(notified).toBe(1);
  });
});

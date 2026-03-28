import { describe, it, expect, beforeEach } from 'vitest';
import type { RecordedRide, RideStats } from '../data/ride';
import {
  saveRide,
  loadRide,
  loadAllRides,
  deleteRide,
  renameRide,
  getRideSummaries,
  closeDB,
} from './ride-storage';

const FAKE_STATS: RideStats = {
  distance: 1000,
  elapsedTime: 3600000,
  movingTime: 3000000,
  avgSpeed: 5,
  maxSpeed: 10,
  elevationGain: 50,
  elevationLoss: 30,
  elevationMin: 190,
  elevationMax: 240,
};

function makeFakeRide(overrides?: Partial<RecordedRide>): RecordedRide {
  return {
    id: 'test-id-1',
    name: 'Test Ride',
    startTime: 1700000000000,
    endTime: 1700003600000,
    points: [],
    stats: { ...FAKE_STATS },
    bounds: [-85.31, 35.04, -85.29, 35.06] as [number, number, number, number],
    ...overrides,
  };
}

// Clear IndexedDB between tests
beforeEach(() => {
  closeDB();
  indexedDB.deleteDatabase('bike-chatt-rides');
});

describe('ride-storage (IndexedDB)', () => {
  describe('saveRide + loadRide', () => {
    it('round-trips a saved ride', async () => {
      const ride = makeFakeRide();
      await saveRide(ride);
      const loaded = await loadRide(ride.id);
      expect(loaded).toEqual(ride);
    });

    it('returns null for a non-existent ride', async () => {
      expect(await loadRide('nonexistent')).toBeNull();
    });

    it('overwrites on re-save', async () => {
      await saveRide(makeFakeRide({ name: 'Original' }));
      await saveRide(makeFakeRide({ name: 'Updated' }));
      const loaded = await loadRide('test-id-1');
      expect(loaded?.name).toBe('Updated');
    });
  });

  describe('loadAllRides', () => {
    it('returns empty array when no rides exist', async () => {
      expect(await loadAllRides()).toEqual([]);
    });

    it('returns rides sorted by startTime descending', async () => {
      await saveRide(makeFakeRide({ id: 'old', startTime: 1000 }));
      await saveRide(makeFakeRide({ id: 'new', startTime: 3000 }));
      await saveRide(makeFakeRide({ id: 'mid', startTime: 2000 }));
      const rides = await loadAllRides();
      expect(rides.map((r) => r.id)).toEqual(['new', 'mid', 'old']);
    });
  });

  describe('deleteRide', () => {
    it('removes a ride', async () => {
      await saveRide(makeFakeRide({ id: 'to-delete' }));
      await deleteRide('to-delete');
      expect(await loadRide('to-delete')).toBeNull();
    });

    it('does not throw for non-existent ride', async () => {
      await expect(deleteRide('nonexistent')).resolves.toBeUndefined();
    });
  });

  describe('renameRide', () => {
    it('updates the name', async () => {
      await saveRide(makeFakeRide({ id: 'rename-me' }));
      await renameRide('rename-me', 'New Name');
      const loaded = await loadRide('rename-me');
      expect(loaded?.name).toBe('New Name');
    });

    it('does not throw for non-existent ride', async () => {
      await expect(renameRide('nonexistent', 'Name')).resolves.toBeUndefined();
    });
  });

  describe('getRideSummaries', () => {
    it('returns empty array when no rides exist', async () => {
      expect(await getRideSummaries()).toEqual([]);
    });

    it('returns summaries with correct fields', async () => {
      await saveRide(
        makeFakeRide({ id: 'sum-1', name: 'First', startTime: 2000 }),
      );
      const summaries = await getRideSummaries();
      expect(summaries).toHaveLength(1);
      expect(summaries[0].id).toBe('sum-1');
      expect(summaries[0].name).toBe('First');
      expect(summaries[0].startTime).toBe(2000);
      expect(summaries[0].stats).toEqual(FAKE_STATS);
      expect((summaries[0] as Record<string, unknown>).points).toBeUndefined();
    });

    it('returns summaries sorted by startTime descending', async () => {
      await saveRide(makeFakeRide({ id: 'a', startTime: 1000 }));
      await saveRide(makeFakeRide({ id: 'b', startTime: 3000 }));
      await saveRide(makeFakeRide({ id: 'c', startTime: 2000 }));
      const summaries = await getRideSummaries();
      expect(summaries.map((s) => s.id)).toEqual(['b', 'c', 'a']);
    });
  });
});

import { describe, expect, it } from 'vitest';
import {
  createAltitudeSpikeFilter,
  createElevationAccumulator,
} from './elevation';

describe('altitude spike filtering', () => {
  it('rejects a short burst but follows a sustained change in ground', () => {
    const filter = createAltitudeSpikeFilter(100);
    expect(
      [300, 301, 100, 101].map((altitude) => filter.add(altitude)),
    ).toEqual([100, 100, 100, 101]);
    expect(Array.from({ length: 6 }, () => filter.add(300))).toEqual([
      101, 101, 101, 101, 101, 300,
    ]);
    expect(filter.add(310)).toBe(310);
  });
});

describe('incremental elevation accumulation', () => {
  it('waits for both distance and altitude change, then counts gain and loss', () => {
    const elevation = createElevationAccumulator();
    elevation.add(100, 0);
    elevation.add(110, 10);
    expect(elevation.totals().gain).toBe(0);
    elevation.add(null, 10);
    elevation.add(110, 0);
    elevation.add(108, 20);
    expect(elevation.totals()).toEqual({
      gain: 10,
      loss: 0,
      min: 100,
      max: 110,
    });
    elevation.add(100, 0);
    expect(elevation.totals().loss).toBe(10);
  });

  it('preserves totals across disconnected segments without counting the gap', () => {
    const elevation = createElevationAccumulator({
      gain: 30,
      loss: 20,
      min: 10,
      max: 200,
    });
    elevation.add(100, 0);
    elevation.add(110, 20);
    elevation.resetSegment();
    expect(elevation.isSeeded).toBe(false);
    elevation.add(1000, 0);
    elevation.add(1010, 20);
    expect(elevation.totals()).toEqual({
      gain: 50,
      loss: 20,
      min: 10,
      max: 1010,
    });
  });
});

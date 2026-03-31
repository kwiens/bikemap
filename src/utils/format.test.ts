import { describe, it, expect } from 'vitest';
import {
  formatElapsed,
  formatDuration,
  formatDurationShort,
  formatDistance,
  formatSpeed,
  formatElevation,
  formatDate,
  formatBytes,
  METERS_PER_MILE,
} from './format';

describe('formatElapsed', () => {
  it.each([
    [0, '0:00'],
    [5, '0:05'],
    [65, '1:05'],
    [600, '10:00'],
    [3600, '1:00:00'],
    [3661, '1:01:01'],
  ])('formats %i seconds as "%s"', (seconds, expected) => {
    expect(formatElapsed(seconds)).toBe(expected);
  });
});

describe('formatDuration', () => {
  it('converts ms to elapsed format', () => {
    expect(formatDuration(60000)).toBe('1:00');
    expect(formatDuration(3661000)).toBe('1:01:01');
  });
});

describe('formatDurationShort', () => {
  it.each([
    [0, '0m'],
    [60000, '1m'],
    [3600000, '1h 0m'],
    [5400000, '1h 30m'],
  ])('formats %i ms as "%s"', (ms, expected) => {
    expect(formatDurationShort(ms)).toBe(expected);
  });
});

describe('formatDistance', () => {
  it('converts meters to miles', () => {
    expect(formatDistance(METERS_PER_MILE)).toBe('1.0 mi');
    expect(formatDistance(0)).toBe('0.0 mi');
    expect(formatDistance(METERS_PER_MILE * 5.5)).toBe('5.5 mi');
  });
});

describe('formatSpeed', () => {
  it('converts m/s to mph', () => {
    expect(formatSpeed(0)).toBe('0.0 mph');
    // 4.47 m/s ≈ 10 mph
    expect(formatSpeed(4.47)).toBe('10.0 mph');
  });
});

describe('formatElevation', () => {
  it('converts meters to feet', () => {
    expect(formatElevation(0)).toBe('0 ft');
    expect(formatElevation(100)).toBe('328 ft');
    expect(formatElevation(304.8)).toBe('1000 ft');
  });
});

describe('formatDate', () => {
  it('formats timestamp as short date', () => {
    // Jan 15, 2026
    const ts = new Date(2026, 0, 15).getTime();
    expect(formatDate(ts)).toBe('Jan 15');
  });
});

describe('formatBytes', () => {
  it.each([
    [500, '500 KB'],
    [1024, '1.0 MB'],
    [1536, '1.5 MB'],
    [1048576, '1.0 GB'],
  ])('formats %i KB as "%s"', (kb, expected) => {
    expect(formatBytes(kb)).toBe(expected);
  });
});

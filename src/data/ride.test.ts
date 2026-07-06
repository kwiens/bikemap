import { describe, it, expect } from 'vitest';
import { generateRideName } from './ride';

describe('generateRideName', () => {
  it('formats a known timestamp correctly', () => {
    // June 15, 2024 at 2:30 PM UTC
    const ts = new Date('2024-06-15T14:30:00').getTime();
    const name = generateRideName(ts);
    expect(name).toContain('Ride on');
    expect(name).toContain('Jun');
    expect(name).toContain('15');
    expect(name).toContain('2024');
    expect(name).toContain('2:30');
  });

  it('includes "at" between date and time', () => {
    const ts = new Date('2024-01-01T09:00:00').getTime();
    const name = generateRideName(ts);
    expect(name).toContain(' at ');
  });
});

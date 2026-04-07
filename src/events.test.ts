import { describe, it, expect } from 'vitest';
import { MAP_EVENTS } from './events';

describe('MAP_EVENTS', () => {
  it('includes MAP_READY event', () => {
    expect(MAP_EVENTS.MAP_READY).toBe('map-ready');
  });

  it('has unique event names', () => {
    const values = Object.values(MAP_EVENTS);
    expect(new Set(values).size).toBe(values.length);
  });
});

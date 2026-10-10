/** @vitest-environment jsdom */

import { describe, it, expect, vi } from 'vitest';
import { MAP_EVENTS, dispatchMapEvent, onMapEvent } from './events';

describe('MAP_EVENTS', () => {
  it('includes MAP_READY event', () => {
    expect(MAP_EVENTS.MAP_READY).toBe('map-ready');
  });

  it('has unique event names', () => {
    const values = Object.values(MAP_EVENTS);
    expect(new Set(values).size).toBe(values.length);
  });
});

describe('dispatchMapEvent / onMapEvent', () => {
  it('delivers the detail to a typed listener', () => {
    const seen: string[] = [];
    const off = onMapEvent(MAP_EVENTS.ROUTE_SELECT, ({ routeId }) => {
      seen.push(routeId);
    });
    dispatchMapEvent(MAP_EVENTS.ROUTE_SELECT, { routeId: 'zoo-loop' });
    off();
    dispatchMapEvent(MAP_EVENTS.ROUTE_SELECT, { routeId: 'after-off' });
    expect(seen).toEqual(['zoo-loop']);
  });

  it('dispatches detail-less events as plain Events', () => {
    const handler = vi.fn();
    const off = onMapEvent(MAP_EVENTS.ROUTE_DESELECT, handler);
    dispatchMapEvent(MAP_EVENTS.ROUTE_DESELECT);
    off();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(undefined);
  });

  it('interoperates with raw CustomEvent dispatchers', () => {
    // Tests and third-party code may still dispatch the DOM event directly;
    // typed listeners must see the same detail.
    const handler = vi.fn();
    const off = onMapEvent(MAP_EVENTS.TOAST, handler);
    window.dispatchEvent(
      new CustomEvent(MAP_EVENTS.TOAST, { detail: { message: 'hi' } }),
    );
    off();
    expect(handler).toHaveBeenCalledWith({ message: 'hi' });
  });

  it('honours once', () => {
    const handler = vi.fn();
    onMapEvent(MAP_EVENTS.MAP_READY, handler, { once: true });
    dispatchMapEvent(MAP_EVENTS.MAP_READY);
    dispatchMapEvent(MAP_EVENTS.MAP_READY);
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

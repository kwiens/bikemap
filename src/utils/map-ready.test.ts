import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  clearMapReady,
  isMapReady,
  onMapReady,
  setMapReady,
} from './map-ready';

describe('map-ready handshake', () => {
  beforeEach(() => {
    clearMapReady();
  });

  afterEach(() => {
    clearMapReady();
  });

  it('starts not-ready and becomes ready once set', () => {
    expect(isMapReady()).toBe(false);
    setMapReady();
    expect(isMapReady()).toBe(true);
  });

  it('runs a late subscriber immediately when already ready', () => {
    setMapReady();
    const callback = vi.fn();
    onMapReady(callback);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('defers an early subscriber until the map signals ready', () => {
    const callback = vi.fn();
    onMapReady(callback);
    expect(callback).not.toHaveBeenCalled();

    setMapReady();
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('fires a deferred subscriber only once', () => {
    const callback = vi.fn();
    onMapReady(callback);
    setMapReady();
    setMapReady();
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('unsubscribes cleanly before the map is ready', () => {
    const callback = vi.fn();
    const unsubscribe = onMapReady(callback);
    unsubscribe();

    setMapReady();
    expect(callback).not.toHaveBeenCalled();
  });

  it('returns a no-op unsubscribe when it ran immediately', () => {
    setMapReady();
    const callback = vi.fn();
    expect(() => onMapReady(callback)()).not.toThrow();
    expect(callback).toHaveBeenCalledTimes(1);
  });

  // The Strict Mode / remount case: a stale flag would make the second mount
  // dispatch against a torn-down map, having skipped the MAP_READY listener.
  it('clears the flag so a remount waits for the new map', () => {
    setMapReady();
    clearMapReady();
    expect(isMapReady()).toBe(false);

    const callback = vi.fn();
    onMapReady(callback);
    expect(callback).not.toHaveBeenCalled();

    setMapReady();
    expect(callback).toHaveBeenCalledTimes(1);
  });
});

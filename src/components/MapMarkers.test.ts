import { beforeEach, describe, expect, it, vi } from 'vitest';
import type mapboxgl from 'mapbox-gl';

interface MockPopup {
  isOpen: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  trigger: (event: 'open' | 'close') => void;
}

interface MockMarker {
  getLngLat: ReturnType<typeof vi.fn>;
  getPopup: ReturnType<typeof vi.fn>;
  togglePopup: ReturnType<typeof vi.fn>;
  addTo: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
}

const makePopup = (open = false): MockPopup => {
  let isOpen = open;
  const listeners: Record<'open' | 'close', Array<() => void>> = {
    open: [],
    close: [],
  };

  return {
    isOpen: vi.fn(() => isOpen),
    remove: vi.fn(() => {
      isOpen = false;
      listeners.close.forEach((listener) => {
        listener();
      });
    }),
    on: vi.fn((event: 'open' | 'close', handler: () => void) => {
      listeners[event].push(handler);
    }),
    trigger: (event: 'open' | 'close') => {
      isOpen = event === 'open';
      listeners[event].forEach((listener) => {
        listener();
      });
    },
  };
};

const makeMarker = (lng: number, lat: number): MockMarker => {
  const popup = makePopup();
  return {
    getLngLat: vi.fn().mockReturnValue({ lng, lat }),
    getPopup: vi.fn().mockReturnValue(popup),
    togglePopup: vi.fn(() => popup.trigger('open')),
    addTo: vi.fn().mockReturnThis(),
    remove: vi.fn(),
  };
};

function asMarker(marker: MockMarker): mapboxgl.Marker {
  return marker as unknown as mapboxgl.Marker;
}

vi.mock('mapbox-gl', () => ({
  default: {
    Marker: vi.fn().mockImplementation(() => ({
      getLngLat: vi.fn().mockReturnValue({ lng: 0, lat: 0 }),
      getPopup: vi.fn(),
      togglePopup: vi.fn(),
      addTo: vi.fn().mockReturnThis(),
      remove: vi.fn(),
    })),
    Popup: vi.fn(),
    accessToken: '',
  },
}));

import { MarkerManager } from './MapMarkers';

describe('MarkerManager', () => {
  let manager: MarkerManager;

  beforeEach(() => {
    manager = new MarkerManager();
  });

  it('tracks markers added via setMarkers()', () => {
    const m1 = makeMarker(1, 2);
    const m2 = makeMarker(3, 4);

    manager.setMarkers([asMarker(m1), asMarker(m2)]);

    expect(manager.length).toBe(2);
  });

  it('findByCoordinates returns the correct marker', () => {
    const m1 = makeMarker(-85.3, 35.0);
    const m2 = makeMarker(-85.4, 35.1);

    manager.setMarkers([asMarker(m1), asMarker(m2)]);

    expect(manager.findByCoordinates(-85.3, 35.0)).toBe(asMarker(m1));
    expect(manager.findByCoordinates(-85.4, 35.1)).toBe(asMarker(m2));
  });

  describe('openPopupFor()', () => {
    it('is a callable method on MarkerManager instances', () => {
      expect(typeof manager.openPopupFor).toBe('function');
    });

    it('opens the popup on the given marker', () => {
      const marker = makeMarker(1, 2);

      manager.setMarkers([asMarker(marker)]);
      manager.openPopupFor(asMarker(marker));

      expect(marker.togglePopup).toHaveBeenCalledOnce();
    });

    it('closes the previously active popup before opening the new one', () => {
      const previousMarker = makeMarker(1, 2);
      const nextMarker = makeMarker(3, 4);
      const previousPopup = previousMarker.getPopup() as MockPopup;

      manager.setMarkers([asMarker(previousMarker), asMarker(nextMarker)]);

      manager.openPopupFor(asMarker(previousMarker));
      manager.openPopupFor(asMarker(nextMarker));

      expect(previousPopup.remove).toHaveBeenCalledOnce();
      expect(nextMarker.togglePopup).toHaveBeenCalledOnce();
    });

    it('closes the previous popup when a new marker popup opens directly', () => {
      const previousMarker = makeMarker(1, 2);
      const nextMarker = makeMarker(3, 4);
      const previousPopup = previousMarker.getPopup() as MockPopup;
      const nextPopup = nextMarker.getPopup() as MockPopup;

      manager.setMarkers([asMarker(previousMarker), asMarker(nextMarker)]);

      previousPopup.trigger('open');
      nextPopup.trigger('open');

      expect(previousPopup.remove).toHaveBeenCalledOnce();
    });

    it('does not close the popup when the same marker is selected again', () => {
      const marker = makeMarker(1, 2);
      const popup = marker.getPopup() as MockPopup;

      manager.setMarkers([asMarker(marker)]);

      manager.openPopupFor(asMarker(marker));
      manager.openPopupFor(asMarker(marker));

      expect(popup.remove).not.toHaveBeenCalled();
      expect(marker.togglePopup).toHaveBeenCalledOnce();
    });

    it('clears active marker when clear() is called', () => {
      const marker = makeMarker(1, 2);
      const popup = marker.getPopup() as MockPopup;
      const nextMarker = makeMarker(3, 4);

      manager.setMarkers([asMarker(marker), asMarker(nextMarker)]);
      manager.openPopupFor(asMarker(marker));
      manager.clear();
      manager.setMarkers([asMarker(nextMarker)]);

      // After clear(), opening a new popup should not try to close the old one
      expect(() => manager.openPopupFor(asMarker(nextMarker))).not.toThrow();
      expect(popup.remove).not.toHaveBeenCalled();
    });
  });
});

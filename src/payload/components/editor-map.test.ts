/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest';
import { createEditorMap } from './editor-map';

const mocks = vi.hoisted(() => ({ createMap: vi.fn() }));
vi.mock('mapbox-gl', () => ({
  default: {
    Map: class {
      constructor(options: unknown) {
        mocks.createMap(options);
      }
      addControl() {}
    },
    NavigationControl: class {},
  },
}));

describe('editor starting camera', () => {
  it('fits a saved route instead of opening at the default world view', () => {
    const bounds: [number, number, number, number] = [-121.5, 44, -121.4, 44.1];
    const fitBoundsOptions = { padding: 60, maxZoom: 16 };
    createEditorMap(document.createElement('div'), {
      bounds,
      fitBoundsOptions,
    });
    expect(mocks.createMap).toHaveBeenLastCalledWith(
      expect.objectContaining({ bounds, fitBoundsOptions }),
    );
  });

  it('uses the city camera for a new route', () => {
    createEditorMap(
      document.createElement('div'),
      { center: [-121.4, 44], zoom: 12 },
      false,
    );
    expect(mocks.createMap).toHaveBeenLastCalledWith(
      expect.objectContaining({
        center: [-121.4, 44],
        zoom: 12,
        boxZoom: false,
      }),
    );
  });
});

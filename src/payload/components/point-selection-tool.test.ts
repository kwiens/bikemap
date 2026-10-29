/** @vitest-environment jsdom */

import type mapboxgl from 'mapbox-gl';
import { describe, expect, it, vi } from 'vitest';
import { createPointSelectionTool } from './point-selection-tool';

vi.mock('mapbox-gl', () => ({
  default: {
    Point: class {
      constructor(
        public x: number,
        public y: number,
      ) {}
      dist(other: { x: number; y: number }) {
        return Math.hypot(this.x - other.x, this.y - other.y);
      }
    },
  },
}));

type Handler = (event: unknown) => void;

/** One piece of three points, 100 px apart on screen. */
const PARTS: [number, number][][] = [
  [
    [0, 0],
    [0.01, 0],
    [0.02, 0],
  ],
];

function setUp() {
  const handlers = new Map<string, Handler>();
  const dragPan = { disable: vi.fn(), enable: vi.fn() };
  const map = {
    dragPan,
    getCanvas: () => ({ style: {} }),
    getCanvasContainer: () => ({
      getBoundingClientRect: () => ({ left: 0, top: 0 }),
    }),
    getSource: () => undefined,
    off: (event: string, handler: Handler) => {
      if (handlers.get(event) === handler) {
        handlers.delete(event);
      }
    },
    on: (event: string, handler: Handler) => handlers.set(event, handler),
    project: ([lng, lat]: [number, number]) => screenPoint(lng * 10_000, lat),
  } as unknown as mapboxgl.Map;
  const tool = createPointSelectionTool(map, {
    apply: vi.fn(),
    getParts: () => PARTS,
    isActive: () => true,
    onSelection: vi.fn(),
    preview: vi.fn(),
  });

  return {
    dragPan,
    handlers,
    /** A press and an unmoved release on the point at `x`. */
    press(x: number, modifiers: { ctrlKey?: boolean } = {}) {
      handlers.get('mousedown')?.({
        originalEvent: { button: 0, ...modifiers },
        point: screenPoint(x, 0),
        preventDefault: vi.fn(),
      });
      window.dispatchEvent(
        new MouseEvent('mouseup', { clientX: x, clientY: 0 }),
      );
    },
    tool,
  };
}

function screenPoint(x: number, y: number) {
  return {
    dist: (o: { x: number; y: number }) => Math.hypot(x - o.x, y - o.y),
    x,
    y,
  };
}

describe('Select points clicks', () => {
  it('narrows a selection to the point clicked', () => {
    const { press, tool } = setUp();
    tool.selectAll();

    press(100);

    expect(tool.selection()).toEqual([{ index: 1, part: 0 }]);
  });

  it('still toggles one point on a modifier-click', () => {
    const { press, tool } = setUp();
    tool.selectAll();

    press(100, { ctrlKey: true });

    expect(tool.selection()).toEqual([
      { index: 0, part: 0 },
      { index: 2, part: 0 },
    ]);
  });

  it('lets go of the window and the map once disposed', () => {
    const { dragPan, handlers, tool } = setUp();
    handlers.get('mousedown')?.({
      originalEvent: { button: 0 },
      point: screenPoint(100, 0),
      preventDefault: vi.fn(),
    });

    tool.dispose();
    window.dispatchEvent(new MouseEvent('mouseup', { clientX: 100 }));

    expect(dragPan.enable).not.toHaveBeenCalled();
    expect(handlers.size).toBe(0);
  });
});

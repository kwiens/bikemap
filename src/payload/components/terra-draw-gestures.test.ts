/**
 * What Terra Draw's editing gestures actually do.
 *
 * The geometry editor's hint text tells curators which gesture removes a point
 * and which removes a whole piece, and its undo works around one of them not
 * being undoable. Both are claims about a dependency, and both were wrong once:
 * the hint used to say "click a point and press Delete to remove it", which is
 * the gesture that silently destroys the entire piece — irrecoverably, because
 * Terra Draw reports the undo as successful and leaves the piece deleted.
 *
 * So these run the real Terra Draw through the real Mapbox adapter and assert
 * the behaviour we describe and compensate for. If a future version changes any
 * of it, this fails rather than the admin quietly losing a section of trail.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  TerraDraw,
  TerraDrawLineStringMode,
  TerraDrawModeUndoRedo,
  TerraDrawSelectMode,
  TerraDrawSessionUndoRedo,
} from 'terra-draw';
import { TerraDrawMapboxGLAdapter } from 'terra-draw-mapbox-gl-adapter';

/** Only as much of a Mapbox map as the adapter reaches for. */
type AdapterMap = ConstructorParameters<
  typeof TerraDrawMapboxGLAdapter
>[0]['map'];

/** Pixels per degree, for the stub map's projection. */
const SCALE = 10000;
const LINESTRING = 'linestring';
const SELECT = 'select';

/** A 27-point piece, the length of a real OSM way. */
const PIECE: [number, number][] = Array.from(
  { length: 27 },
  (_, i) => [-121.5 + i * 0.005, 44.0] as [number, number],
);

/**
 * A map that is only as real as the adapter needs.
 *
 * The canvas collects listeners so events can be delivered by hand, and the
 * projection is flat so a lng/lat maps to a predictable pixel — which is what
 * lets a "click" land on a specific point of the line.
 */
function harness() {
  const listeners = new Map<string, Set<(event: unknown) => void>>();
  const canvas: Record<string, unknown> = {
    addEventListener(type: string, fn: (event: unknown) => void) {
      const set = listeners.get(type) ?? new Set();
      set.add(fn);
      listeners.set(type, set);
    },
    removeEventListener(type: string, fn: (event: unknown) => void) {
      listeners.get(type)?.delete(fn);
    },
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
    style: {} as Record<string, string>,
  };

  const map = {
    addLayer() {},
    addSource() {},
    doubleClickZoom: { disable() {}, enable() {} },
    dragPan: { disable() {}, enable() {}, isEnabled: () => true },
    dragRotate: { disable() {}, enable() {}, isEnabled: () => true },
    getCanvas: () => canvas,
    getContainer: () => canvas,
    getLayer: () => undefined,
    getSource: () => ({ setData() {} }),
    off() {},
    on() {},
    project: ({ lng, lat }: { lng: number; lat: number }) => ({
      x: lng * SCALE,
      y: -lat * SCALE,
    }),
    removeLayer() {},
    removeSource() {},
    unproject: ({ x, y }: { x: number; y: number }) => ({
      lat: -y / SCALE,
      lng: x / SCALE,
    }),
  } as unknown as AdapterMap;

  function fire(type: string, event: Record<string, unknown>) {
    for (const fn of [...(listeners.get(type) ?? [])]) {
      fn({
        button: 0,
        isPrimary: true,
        isTrusted: true,
        preventDefault() {},
        stopPropagation() {},
        target: canvas,
        ...event,
      });
    }
  }

  const at = (point: [number, number]) => ({
    clientX: point[0] * SCALE,
    clientY: -point[1] * SCALE,
  });

  // Mirrors the editor's own configuration — the flags are what decide whether
  // a coordinate can be deleted at all.
  const draw = new TerraDraw({
    adapter: new TerraDrawMapboxGLAdapter({ map }),
    modes: [
      new TerraDrawSelectMode({
        flags: {
          [LINESTRING]: {
            feature: {
              coordinates: {
                deletable: true,
                draggable: true,
                midpoints: { draggable: true },
                snappable: true,
              },
              draggable: false,
            },
          },
        },
        pointerDistance: 20,
      }),
      new TerraDrawLineStringMode({ editable: true, pointerDistance: 20 }),
    ],
    undoRedo: {
      modeLevel: new TerraDrawModeUndoRedo(),
      sessionLevel: new TerraDrawSessionUndoRedo(),
    },
  });

  draw.start();
  draw.setMode(SELECT);
  draw.addFeatures([
    {
      geometry: { coordinates: PIECE, type: 'LineString' },
      properties: { mode: LINESTRING },
      type: 'Feature',
    },
    // The store assigns the ids, so the input is short of the stored shape.
  ] as unknown as Parameters<TerraDraw['addFeatures']>[0]);

  const lines = () =>
    draw
      .getSnapshot()
      .filter((feature) => feature.geometry.type === 'LineString');

  const id = lines()[0]?.id;
  if (id === undefined) {
    throw new Error('the line did not enter the store');
  }
  draw.selectFeature(id, SELECT);
  draw.clearUndoRedoHistory();

  return {
    draw,
    lines,
    pieces: () => lines().length,
    points: () =>
      (lines()[0]?.geometry.coordinates as unknown[] | undefined)?.length ?? 0,
    leftClick(point: [number, number]) {
      fire('pointerdown', at(point));
      fire('pointerup', at(point));
    },
    press(key: string) {
      fire('keyup', { key });
    },
    /** Browsers fire pointerdown, then contextmenu, then pointerup. */
    rightClick(point: [number, number]) {
      fire('pointerdown', { ...at(point), button: 2 });
      fire('contextmenu', { ...at(point), button: 2 });
      fire('pointerup', { ...at(point), button: 2 });
    },
  };
}

let h: ReturnType<typeof harness>;

beforeEach(() => {
  h = harness();
});

describe('removing a point', () => {
  it('is right-click, not click-then-Delete', () => {
    // The gesture the hint names. Anything else here means the hint is lying to
    // curators about which of their edits is reversible.
    h.rightClick(PIECE[13]);

    expect(h.points()).toBe(PIECE.length - 1);
    expect(h.pieces()).toBe(1);
  });

  it('is undoable', () => {
    h.rightClick(PIECE[13]);
    h.draw.undo();

    expect(h.points()).toBe(PIECE.length);
  });

  it('works on an endpoint too', () => {
    h.rightClick(PIECE[0]);

    expect(h.points()).toBe(PIECE.length - 1);
  });
});

describe('the Delete key', () => {
  it('removes the whole piece, not the point under the cursor', () => {
    // This is why the hint has to describe the two deletions separately: they
    // are one keystroke apart and differ by an entire section of trail.
    h.leftClick(PIECE[13]);
    h.press('Delete');

    expect(h.pieces()).toBe(0);
  });

  it('does not need a point clicked first', () => {
    h.press('Delete');

    expect(h.pieces()).toBe(0);
  });

  it('cannot be undone by Terra Draw, while claiming otherwise', () => {
    // The reason `deleted-pieces.ts` exists. `canUndo()` says yes and `undo()`
    // reports success, and the piece stays gone — so the editor keeps its own
    // snapshot and falls back to it when an undo moves nothing.
    h.press('Delete');

    expect(h.draw.canUndo()).toBe(true);
    expect(h.draw.undo()).toBe(true);
    expect(h.pieces()).toBe(0);
  });
});

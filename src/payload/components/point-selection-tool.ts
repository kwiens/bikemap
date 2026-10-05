/**
 * Select points: pick any number of a line's points, across every piece, and
 * act on them together.
 *
 *   click a point          select just that point
 *   Shift/Ctrl/⌘-click     add or remove one point
 *   Shift-drag             select every point in a box (adds to the selection)
 *   drag a selected point  move the whole selection together
 *   click empty map        clear the selection
 *
 * Terra Draw can't do this — its select mode edits one point of one feature —
 * so while this mode is active Terra Draw is inert and only draws the line, and
 * this module owns the pointer. Like the route tool it is framework-free:
 * vertex rendering and drag previews go straight to Mapbox sources, and React
 * hears only about selection changes, through `onSelection`.
 *
 * Mouse only. Shift-drag needs a keyboard, and a phone curator has Adjust line.
 */
import mapboxgl from 'mapbox-gl';
import {
  movePoints,
  parsePointKey,
  type PointRef,
  pointKey,
} from '@/payload/osm/line-edits';

type Position = [number, number];
type Parts = Position[][];

export interface PointSelectionHost {
  /** Commits a finished gesture as one undoable edit, starting from `before`. */
  apply(next: Parts, before: Parts): void;
  getParts(): Parts;
  isActive(): boolean;
  onSelection(selection: PointRef[]): void;
  /** Shows a line mid-gesture without committing it. */
  preview(next: Parts): void;
}

export interface PointSelectionTool {
  clear(): void;
  /** (Re)adds the tool's layers. Call after every `style.load`. */
  install(): void;
  /** Redraws the points from the host's line. Call whenever the line changes. */
  refresh(): void;
  selectAll(): void;
  selection(): PointRef[];
  setSelection(selection: PointRef[]): void;
}

const VERTEX_SOURCE = 'point-selection-vertices';
const SELECTED_COLOR = '#EA580C';
const POINT_COLOR = '#2563EB';

/** How close, in pixels, a click must land to hit a point. */
const HIT_PIXELS = 12;
/** Pointer travel, in pixels, below which a press counts as a click. */
const CLICK_SLOP_PIXELS = 4;

const EMPTY: GeoJSON.FeatureCollection = {
  features: [],
  type: 'FeatureCollection',
};

type Gesture =
  | { kind: 'box'; start: mapboxgl.Point }
  | {
      base: Parts;
      kind: 'drag';
      hasMoved: boolean;
      start: mapboxgl.LngLat;
      startPoint: mapboxgl.Point;
    }
  | { kind: 'press'; start: mapboxgl.Point };

export function createPointSelectionTool(
  map: mapboxgl.Map,
  host: PointSelectionHost,
): PointSelectionTool {
  let selected = new Set<string>();
  let gesture: Gesture | null = null;
  let box: HTMLDivElement | null = null;
  let frame = 0;
  let pending: (() => void) | null = null;

  function changed() {
    refresh();
    host.onSelection(current());
  }

  function current(): PointRef[] {
    return [...selected].map(parsePointKey);
  }

  /** Drops selected keys that no longer name a point, after the line changes underneath. */
  function prune(parts: Parts) {
    for (const key of selected) {
      const { index, part } = parsePointKey(key);
      if (!parts[part] || index >= parts[part].length) {
        selected.delete(key);
      }
    }
  }

  function refresh() {
    const parts = host.getParts();
    const before = selected.size;
    prune(parts);
    if (selected.size !== before) {
      host.onSelection(current());
    }
    const source = map.getSource(VERTEX_SOURCE) as
      | mapboxgl.GeoJSONSource
      | undefined;
    if (!source) {
      return;
    }
    if (!host.isActive()) {
      source.setData(EMPTY);
      return;
    }
    source.setData({
      features: parts.flatMap((part, partIndex) =>
        part.map((coordinates, index) => ({
          geometry: { coordinates, type: 'Point' as const },
          properties: {
            end: index === 0 || index === part.length - 1,
            selected: selected.has(pointKey({ index, part: partIndex })),
          },
          type: 'Feature' as const,
        })),
      ),
      type: 'FeatureCollection',
    });
  }

  /** The point nearest a screen position, within `HIT_PIXELS`. */
  function hitAt(at: mapboxgl.Point): PointRef | null {
    let best: PointRef | null = null;
    let bestPixels = HIT_PIXELS;
    host.getParts().forEach((part, partIndex) => {
      part.forEach((coordinates, index) => {
        const pixels = at.dist(map.project(coordinates));
        if (pixels <= bestPixels) {
          best = { index, part: partIndex };
          bestPixels = pixels;
        }
      });
    });
    return best;
  }

  function toggle(ref: PointRef) {
    const key = pointKey(ref);
    if (selected.has(key)) {
      selected.delete(key);
    } else {
      selected.add(key);
    }
    changed();
  }

  /** Converts a window pointer event to a point in the map's canvas. */
  function canvasPoint(event: MouseEvent): mapboxgl.Point {
    const rect = map.getCanvasContainer().getBoundingClientRect();
    return new mapboxgl.Point(
      event.clientX - rect.left,
      event.clientY - rect.top,
    );
  }

  function onMouseDown(event: mapboxgl.MapMouseEvent) {
    const original = event.originalEvent;
    if (!host.isActive() || original.button !== 0) {
      return;
    }
    const isAdditive =
      original.shiftKey || original.ctrlKey || original.metaKey;

    if (original.shiftKey) {
      // Shift-drag is Mapbox's box zoom; the editor's map turns that off, so the
      // gesture is free to mean box select.
      event.preventDefault();
      gesture = { kind: 'box', start: event.point };
    } else {
      const hit = hitAt(event.point);
      if (hit && isAdditive) {
        toggle(hit);
        return;
      }
      if (hit) {
        if (!selected.has(pointKey(hit))) {
          selected = new Set([pointKey(hit)]);
          changed();
        }
        event.preventDefault();
        gesture = {
          base: host
            .getParts()
            .map((part) => part.map((p) => [...p] as Position)),
          kind: 'drag',
          hasMoved: false,
          start: event.lngLat,
          startPoint: event.point,
        };
      } else {
        // Might be a click on empty map (clear) or the start of a pan (leave
        // alone) — the mouseup decides.
        gesture = { kind: 'press', start: event.point };
        return;
      }
    }

    map.dragPan.disable();
    window.addEventListener('mousemove', onWindowMove);
    window.addEventListener('mouseup', onWindowUp, { once: true });
  }

  function onWindowMove(event: MouseEvent) {
    const at = canvasPoint(event);
    if (gesture?.kind === 'box') {
      drawBox(gesture.start, at);
      return;
    }
    if (gesture?.kind !== 'drag') {
      return;
    }
    if (!gesture.hasMoved && at.dist(gesture.startPoint) < CLICK_SLOP_PIXELS) {
      return;
    }
    gesture.hasMoved = true;
    const { base, start } = gesture;
    const lngLat = map.unproject(at);
    pending = () => {
      const offset: Position = [lngLat.lng - start.lng, lngLat.lat - start.lat];
      host.preview(movePoints(base, current(), offset).parts);
      refresh();
    };
    if (!frame) {
      frame = requestAnimationFrame(() => {
        frame = 0;
        pending?.();
        pending = null;
      });
    }
  }

  function onWindowUp(event: MouseEvent) {
    window.removeEventListener('mousemove', onWindowMove);
    map.dragPan.enable();
    const ended = gesture;
    gesture = null;
    const at = canvasPoint(event);

    if (ended?.kind === 'box') {
      box?.remove();
      box = null;
      if (at.dist(ended.start) < CLICK_SLOP_PIXELS) {
        const hit = hitAt(at);
        if (hit) {
          toggle(hit);
        }
        return;
      }
      selectInBox(ended.start, at);
      return;
    }

    if (ended?.kind === 'drag' && ended.hasMoved) {
      if (frame) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
      pending?.();
      pending = null;
      host.apply(host.getParts(), ended.base);
    }
  }

  function onClick(event: mapboxgl.MapMouseEvent) {
    // Only an unmoved press on empty map reaches here as a `press` — Mapbox
    // does not fire `click` after a pan.
    if (!host.isActive() || gesture?.kind !== 'press') {
      return;
    }
    gesture = null;
    if (selected.size > 0 && !hitAt(event.point)) {
      selected = new Set();
      changed();
    }
  }

  function selectInBox(a: mapboxgl.Point, b: mapboxgl.Point) {
    const minX = Math.min(a.x, b.x);
    const maxX = Math.max(a.x, b.x);
    const minY = Math.min(a.y, b.y);
    const maxY = Math.max(a.y, b.y);
    host.getParts().forEach((part, partIndex) => {
      part.forEach((coordinates, index) => {
        const { x, y } = map.project(coordinates);
        if (x >= minX && x <= maxX && y >= minY && y <= maxY) {
          selected.add(pointKey({ index, part: partIndex }));
        }
      });
    });
    changed();
  }

  function drawBox(a: mapboxgl.Point, b: mapboxgl.Point) {
    if (!box) {
      box = document.createElement('div');
      box.style.cssText =
        'position:absolute;z-index:2;pointer-events:none;border:1.5px dashed #EA580C;background:rgba(234,88,12,0.08);';
      map.getCanvasContainer().appendChild(box);
    }
    box.style.left = `${Math.min(a.x, b.x)}px`;
    box.style.top = `${Math.min(a.y, b.y)}px`;
    box.style.width = `${Math.abs(a.x - b.x)}px`;
    box.style.height = `${Math.abs(a.y - b.y)}px`;
  }

  map.on('mousedown', onMouseDown);
  map.on('click', onClick);
  map.on('mousemove', (event) => {
    if (!host.isActive() || (gesture && gesture.kind !== 'press')) {
      return;
    }
    map.getCanvas().style.cursor = hitAt(event.point) ? 'pointer' : '';
  });

  return {
    clear() {
      if (selected.size > 0) {
        selected = new Set();
        changed();
      }
    },
    install() {
      if (!map.getSource(VERTEX_SOURCE)) {
        map.addSource(VERTEX_SOURCE, { data: EMPTY, type: 'geojson' });
      }
      map.addLayer({
        id: VERTEX_SOURCE,
        paint: {
          'circle-color': ['case', ['get', 'selected'], SELECTED_COLOR, '#fff'],
          'circle-radius': [
            'case',
            ['get', 'selected'],
            6,
            ['get', 'end'],
            5,
            3.5,
          ],
          'circle-stroke-color': [
            'case',
            ['get', 'selected'],
            '#fff',
            POINT_COLOR,
          ],
          'circle-stroke-width': 1.5,
        },
        source: VERTEX_SOURCE,
        type: 'circle',
      });
      refresh();
    },
    refresh,
    selectAll() {
      selected = new Set(
        host
          .getParts()
          .flatMap((part, partIndex) =>
            part.map((_, index) => pointKey({ index, part: partIndex })),
          ),
      );
      changed();
    },
    selection: current,
    setSelection(next) {
      selected = new Set(next.map(pointKey));
      changed();
    },
  };
}

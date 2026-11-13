import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';
import type mapboxgl from 'mapbox-gl';
import {
  TerraDraw,
  TerraDrawLineStringMode,
  TerraDrawModeUndoRedo,
  TerraDrawSelectMode,
  type TerraDrawEventListeners,
} from 'terra-draw';
import { TerraDrawMapboxGLAdapter } from 'terra-draw-mapbox-gl-adapter';
import { mapConfig } from '@/config/map.config';
import {
  OSM_BIKE_TRAIL_FILTER,
  OSM_TRAILS_SOURCE_ID,
  OSM_TRAILS_SOURCE_LAYER,
  OSM_TRAILS_TILEJSON_URL,
} from '@/data/osm-trails';
import { COORDINATE_DECIMALS } from '@/payload/osm/geometry';
import {
  createEditorMap,
  useEditorBasemap,
  type EditorBasemap,
} from './editor-map';
import { createRouteTool, type RouteTool } from './route-tool';
import {
  createPointSelectionTool,
  type PointSelectionTool,
} from './point-selection-tool';
import { removeSelectedLinePointAt } from './terra-draw-point-removal';

type RouteToolHost = Parameters<typeof createRouteTool>[1];
type PointToolHost = Parameters<typeof createPointSelectionTool>[1];

/** Stable handles shared with the component that synchronizes the form. */
export function useGeometryEditorMapRefs() {
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const drawRef = useRef<TerraDraw | null>(null);
  const routeToolRef = useRef<RouteTool | null>(null);
  const selectionToolRef = useRef<PointSelectionTool | null>(null);
  const startedRef = useRef(false);
  return { mapRef, drawRef, routeToolRef, selectionToolRef, startedRef };
}

interface GeometryEditorMapOptions
  extends ReturnType<typeof useGeometryEditorMapRefs> {
  basemap: EditorBasemap;
  container: RefObject<HTMLDivElement | null>;
  onModeChange: () => void;
  onRouteDeactivate: () => void;
  ids: number[];
  mode: GeometryEditorMode;
  editable: boolean;
  isRemovingPoint: boolean;
  networkKind: RouteToolHost['networkKind'];
  historyPoint: RefObject<[number, number] | undefined>;
  getParts: RouteToolHost['getParts'];
  fetchNetwork: RouteToolHost['fetchNetwork'];
  onRouteFinish: RouteToolHost['apply'];
  onRouteStatus: RouteToolHost['onStatus'];
  onPointEdit: PointToolHost['apply'];
  onPointSelection: PointToolHost['onSelection'];
  onPointPreview: PointToolHost['preview'];
  onPick: (id: number, name: string) => void;
  onPointRemoval: (
    result: ReturnType<typeof removeSelectedLinePointAt>,
  ) => void;
  onDrawStart: () => void;
  onDrawError: () => void;
  onDrawChange: TerraDrawEventListeners['change'];
  onDrawFinish: TerraDrawEventListeners['finish'];
  onDrawHistory: TerraDrawEventListeners['history'];
}

/** Owns the Mapbox and Terra Draw instances, their tools, and each style load. */
export function useGeometryEditorMap(
  options: GeometryEditorMapOptions,
): boolean {
  const {
    container,
    drawRef,
    mapRef,
    routeToolRef,
    selectionToolRef,
    startedRef,
  } = options;
  const latest = useRef(options);
  latest.current = options;
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!container.current || !mapConfig.mapbox.accessToken) return;
    // Shift-drag belongs to the point selection tool.
    const instance = createEditorMap(
      container.current,
      mapConfig.defaultView,
      false,
    );
    mapRef.current = instance;
    const editor = createDraw(instance);
    drawRef.current = editor;

    instance.on('click', WAYS_HIT_LAYER, (event) => {
      if (!latest.current.editable || latest.current.mode !== 'pick') return;
      const props = event.features?.[0]?.properties;
      const id = Number(props?.OSM_ID);
      if (!Number.isSafeInteger(id) || id <= 0) return;
      latest.current.onPick(id, String(props?.name ?? `way ${id}`));
    });
    instance.on('mouseenter', WAYS_HIT_LAYER, () => {
      if (latest.current.editable && latest.current.mode === 'pick') {
        instance.getCanvas().style.cursor = 'pointer';
      }
    });
    instance.on('mouseleave', WAYS_HIT_LAYER, () => {
      instance.getCanvas().style.cursor = '';
    });
    instance.on('click', (event) => {
      const { editable, mode, isRemovingPoint, onPointRemoval } =
        latest.current;
      if (
        !startedRef.current ||
        !editable ||
        mode !== 'move' ||
        !isRemovingPoint
      )
        return;
      onPointRemoval(
        removeSelectedLinePointAt(editor, event.lngLat, POINTER_DISTANCE),
      );
    });

    editor.on('change', (...args) => latest.current.onDrawChange(...args));
    editor.on('finish', (...args) => latest.current.onDrawFinish(...args));
    editor.on('history', (...args) => latest.current.onDrawHistory(...args));

    const route = createRouteTool(instance, {
      apply: (...args) => latest.current.onRouteFinish(...args),
      fetchNetwork: (cell) => latest.current.fetchNetwork(cell),
      getParts: () => latest.current.getParts(),
      isActive: () =>
        latest.current.editable && latest.current.mode === 'route',
      networkKind: latest.current.networkKind,
      onStatus: (status) => latest.current.onRouteStatus(status),
    });
    routeToolRef.current = route;

    const points = createPointSelectionTool(instance, {
      apply: (parts, before) => latest.current.onPointEdit(parts, before),
      getParts: () => latest.current.getParts(),
      isActive: () =>
        latest.current.editable && latest.current.mode === 'select',
      onSelection: (selection) => latest.current.onPointSelection(selection),
      preview: (parts) => latest.current.onPointPreview(parts),
    });
    selectionToolRef.current = points;

    instance.on('style.load', () => {
      installWayLayers(instance);
      const { ids, mode, editable, historyPoint, onDrawStart, onDrawError } =
        latest.current;
      applyWayStyle(instance, ids, mode);

      // Terra Draw can only register after the style has loaded. Its sources
      // and layers must be reinstalled after every basemap switch.
      try {
        editor.start();
        startedRef.current = true;
      } catch (error) {
        console.error('Terra Draw could not attach to the map', error);
        onDrawError();
      }
      if (startedRef.current) {
        editor.setMode(terraModeFor(mode, editable));
        onDrawStart();
        // An empty dash array can lose a solid line while Mapbox rebuilds tiles.
        const drawLineLayer = `${DRAW_LAYER_PREFIX}-linestring`;
        if (instance.getLayer(drawLineLayer)) {
          instance.setPaintProperty(drawLineLayer, 'line-dasharray', undefined);
        }
      }

      instance.addSource(HISTORY_POINT_LAYER, {
        type: 'geojson',
        data: historyPointData(historyPoint.current),
      });
      instance.addLayer({
        id: HISTORY_POINT_LAYER,
        type: 'circle',
        source: HISTORY_POINT_LAYER,
        paint: {
          'circle-color': LINE_COLOR,
          'circle-radius': 5,
          'circle-stroke-color': '#fff',
          'circle-stroke-width': 2,
        },
      });
      route.install();
      points.install();
      setReady(true);
    });

    return () => {
      route.dispose();
      points.dispose();
      if (startedRef.current) editor.stop();
      startedRef.current = false;
      drawRef.current = null;
      routeToolRef.current = null;
      selectionToolRef.current = null;
      instance.remove();
      mapRef.current = null;
      setReady(false);
    };
  }, [container, drawRef, mapRef, routeToolRef, selectionToolRef, startedRef]);

  const { basemap, editable, ids, mode } = options;
  const stopDraw = useCallback(() => {
    if (!startedRef.current) return;
    drawRef.current?.stop();
    startedRef.current = false;
  }, [drawRef, startedRef]);
  useEditorBasemap(mapRef, basemap, stopDraw);

  useEffect(() => {
    if (ready && mapRef.current) applyWayStyle(mapRef.current, ids, mode);
  }, [ids, mapRef, mode, ready]);

  useEffect(() => {
    const editor = drawRef.current;
    if (!ready || !editor || !startedRef.current) return;
    const nextMode = terraModeFor(mode, editable);
    if (editor.getMode() !== nextMode) editor.setMode(nextMode);
  }, [drawRef, editable, startedRef, mode, ready]);

  // The tracing tool owns double-click in route mode. Its unfinished line
  // survives a mode switch. Selection handles are local to point mode.
  useEffect(() => {
    const instance = mapRef.current;
    const route = routeToolRef.current;
    const points = selectionToolRef.current;
    if (!ready || !instance || !route || !points) return;

    instance.getCanvas().style.cursor = '';
    if (mode === 'route' && editable) {
      instance.doubleClickZoom.disable();
      route.activate();
    }
    points.refresh();
    latest.current.onModeChange();

    return () => {
      // The lifecycle cleanup disposes both tools before removing the map.
      if (mapRef.current !== instance) return;
      if (mode === 'route' && editable) {
        instance.doubleClickZoom.enable();
        route.deactivate();
        latest.current.onRouteDeactivate();
      }
      if (mode === 'select') points.clear();
    };
  }, [editable, mapRef, mode, ready, routeToolRef, selectionToolRef]);

  return ready;
}

export function paintHistoryPoint(
  map: mapboxgl.Map | null,
  point?: [number, number],
) {
  map
    ?.getSource<mapboxgl.GeoJSONSource>(HISTORY_POINT_LAYER)
    ?.setData(historyPointData(point));
}

function createDraw(map: mapboxgl.Map) {
  return new TerraDraw({
    // Terra Draw defaults to 9 decimals. The line the editor stores, and the
    // copy the form-sync effect compares against, are rounded to
    // COORDINATE_DECIMALS — a dragged point at 9 decimals never matched its
    // own echo, so every edit reloaded the line as a new document.
    adapter: new TerraDrawMapboxGLAdapter({
      coordinatePrecision: COORDINATE_DECIMALS,
      map,
      prefixId: DRAW_LAYER_PREFIX,
    }),
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
              // Dragging a whole trail somewhere else is never what you meant;
              // only its individual points move.
              draggable: false,
            },
          },
        },
        pointerDistance: POINTER_DISTANCE,
      }),
      new TerraDrawLineStringMode({
        editable: true,
        pointerDistance: POINTER_DISTANCE,
        snapping: SNAPPING,
        styles: { lineStringColor: LINE_COLOR, lineStringWidth: 4 },
      }),
    ],
    // Undo/redo is **opt-in**. Without this the `undo()` and `redo()` methods
    // exist and do nothing at all — the base mode's implementations are empty
    // functions.
    //
    // Only the mode level: taking back the last point while still drawing a
    // piece. Completed edits undo through the editor's own history, which
    // also covers what Terra Draw's session level never could — deleted
    // pieces and the bulk edits. Its keyboard shortcuts are left off too;
    // the map's own key handler routes Ctrl+Z to the right stack.
    undoRedo: {
      modeLevel: new TerraDrawModeUndoRedo(),
    },
  });
}

/**
 * Maps a toolbar mode onto a Terra Draw mode.
 *
 * `static` is Terra Draw's own name for "registered but inert" — it keeps
 * rendering the line without offering to edit it, which is what Pick ways and
 * a read-only form both want.
 */
function terraModeFor(mode: GeometryEditorMode, editable: boolean): string {
  if (!editable || mode === 'pick' || mode === 'route' || mode === 'select') {
    return STATIC;
  }
  return mode === 'draw' ? LINESTRING : SELECT;
}

/**
 * The nationwide OSM trails, and a transparent hit layer over them.
 *
 * These are vector-tile features from a remote tileset, so they are ours to
 * handle rather than Terra Draw's — there is nothing in its store to edit. The
 * wide transparent line is what makes them clickable; singletrack rendered at
 * its true width is far too thin to hit reliably.
 */
function installWayLayers(map: mapboxgl.Map) {
  if (!map.getSource(OSM_TRAILS_SOURCE_ID)) {
    map.addSource(OSM_TRAILS_SOURCE_ID, {
      type: 'vector',
      url: OSM_TRAILS_TILEJSON_URL,
    });
  }

  map.addLayer({
    id: WAYS_LAYER,
    filter: OSM_BIKE_TRAIL_FILTER,
    paint: {
      'line-color': UNPICKED_COLOR,
      'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1.5, 16, 4],
    },
    source: OSM_TRAILS_SOURCE_ID,
    'source-layer': OSM_TRAILS_SOURCE_LAYER,
    type: 'line',
  });

  map.addLayer({
    id: WAYS_HIT_LAYER,
    filter: OSM_BIKE_TRAIL_FILTER,
    paint: { 'line-color': '#000', 'line-opacity': 0, 'line-width': 18 },
    source: OSM_TRAILS_SOURCE_ID,
    'source-layer': OSM_TRAILS_SOURCE_LAYER,
    type: 'line',
  });
}

/** Highlights the picked ways, and dims them all while the line is being edited. */
function applyWayStyle(
  map: mapboxgl.Map,
  ids: number[],
  mode: GeometryEditorMode,
) {
  if (!map.getLayer(WAYS_LAYER)) {
    return;
  }
  const picking = mode === 'pick';

  const isPicked = [
    'in',
    ['to-string', ['get', 'OSM_ID']],
    ['literal', ids.map(String)],
  ];

  map.setPaintProperty(WAYS_LAYER, 'line-color', [
    'case',
    isPicked,
    PICKED_COLOR,
    UNPICKED_COLOR,
  ]);
  // `zoom` may only appear at the top level of an `interpolate`/`step`, so the
  // picked/unpicked choice goes in the interpolation *outputs* rather than
  // wrapping the interpolation in a `case` — that form is rejected outright and
  // leaves the layer unstyled.
  map.setPaintProperty(WAYS_LAYER, 'line-width', [
    'interpolate',
    ['linear'],
    ['zoom'],
    10,
    ['case', isPicked, 4, 1.5],
    16,
    ['case', isPicked, 7, 4],
  ]);
  // Dimmed while editing so they stay as context without competing with the
  // line being worked on — except in Follow trails, where they are what the
  // line follows.
  map.setPaintProperty(
    WAYS_LAYER,
    'line-opacity',
    picking || mode === 'route' ? 1 : 0.35,
  );

  if (map.getLayer(WAYS_HIT_LAYER)) {
    // Off while editing, or a click meant for a point gets eaten by a way.
    map.setLayoutProperty(
      WAYS_HIT_LAYER,
      'visibility',
      picking ? 'visible' : 'none',
    );
  }
}

function historyPointData(point?: [number, number]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: point
      ? [
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: point },
            properties: {},
          },
        ]
      : [],
  };
}

export type GeometryEditorMode = 'draw' | 'move' | 'pick' | 'route' | 'select';

const WAYS_LAYER = 'osm-ways';
const WAYS_HIT_LAYER = 'osm-ways-hit';
const HISTORY_POINT_LAYER = 'editor-history-point';

const PICKED_COLOR = '#2563EB';
const UNPICKED_COLOR = '#9CA3AF';
const LINE_COLOR = '#2563EB';
const DRAW_LAYER_PREFIX = 'editor-draw';

/** Terra Draw mode names. `static` is its own name for "registered but inert". */
export const SELECT = 'select';
export const LINESTRING = 'linestring';
const STATIC = 'static';

/**
 * How close a click has to land, in pixels.
 *
 * Terra Draw's default is tight. Singletrack nodes sit ~10 m apart, which at the
 * zoom you actually edit at is a handful of pixels, so the grab radius is what
 * decides whether this feels usable at all.
 */
const POINTER_DISTANCE = 20;

/**
 * Snapping. Closing a gap between two pieces means landing an endpoint exactly
 * on its neighbour, and doing that by eye is precisely the fiddly part.
 */
const SNAPPING = { toCoordinate: true, toLine: true } as const;

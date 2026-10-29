'use client';

/**
 * The route editor: click waypoints and the route follows trails and roads
 * between them.
 *
 * It works the way gpx.studio and brouter-web do. Each click snaps to the
 * nearest trail or road, and each leg is routed over a graph of our published
 * trails plus OpenStreetMap's paths and streets (`routing/graph.ts`). Because
 * a waypoint can land part-way along a line, two waypoints on one trail take
 * just the stretch between them — which is how a route uses part of a trail.
 *
 * `routing/editor-controller.ts` owns the plan, history, and asynchronous edits.
 * This component renders the map and binds the controller to the Payload field.
 * The component authors the route's `plan` field and nothing else. The line,
 * distance, and bounds are derived from the plan on save, so there is no way
 * for them to disagree with what is on screen.
 *
 * ## Rules carried over from the trail editor
 *
 * 1. The map's init effect must run **once**. Every callback its handlers
 *    reach is stable, and anything that varies is read from a ref — re-running
 *    it would call `map.remove()` mid-interaction.
 * 2. Nothing writes state at pointer-move rate. A waypoint drag updates the
 *    plan only on `dragend`.
 */
import {
  createEditorMap,
  useEditorBasemap,
  type EditorBasemap,
} from './editor-map';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import mapboxgl from 'mapbox-gl';
// The (payload) route group has its own tree; without this the controls break.
import 'mapbox-gl/dist/mapbox-gl.css';
import { useField } from '@payloadcms/ui';
import { cityConfigs, isCityId, mapConfig } from '@/config/map.config';
import { boundsOf } from '@/payload/osm/assemble';
import {
  createRouteEditorController,
  type RouteEditorController,
} from '@/payload/routing/editor-controller';
import { METERS_TO_MILES } from '@/payload/osm/units';
import {
  type CellKey,
  cellsCovering,
  MIN_NETWORK_ZOOM,
  MIN_VIEW_LOAD_ZOOM,
} from '@/payload/routing/cells';
import {
  type CuratedTrail,
  type NetworkWay,
  type Position,
  type RouteStep,
} from '@/payload/routing/graph';
import { RouteNetworkStore } from '@/payload/routing/network-store';
import {
  EMPTY_PLAN,
  parseRoutePlan,
  planMeters,
  planSteps,
  type RouteLeg,
  type RoutePlan,
} from '@/payload/routing/plan';
import type { RouteNetworkResponse } from '@/payload/endpoints/route-network';
import { cn } from '@/lib/utils';
import { Banner } from './admin-ui';

const NETWORK_SOURCE = 'route-editor-network';
const TRAILS_SOURCE = 'route-editor-trails';
const ROUTE_SOURCE = 'route-editor-route';
const NETWORK_LAYER = 'route-editor-network';
const TRAILS_LAYER = 'route-editor-trails';
const ROUTE_CASING_LAYER = 'route-editor-route-casing';
const ROUTE_LAYER = 'route-editor-route';
const ROUTE_HIT_LAYER = 'route-editor-route-hit';

const TRAIL_COLOR = '#15803D';
const DEFAULT_ROUTE_COLOR = '#2563EB';

/** Most cells loaded just to draw the view; routing loads its own. */
const MAX_VIEW_CELLS = 4;

/**
 * Fitting a route of one waypoint, or one short leg, would otherwise zoom
 * to the map's limit on a blank tile.
 */
const FIT_OPTIONS = { maxZoom: 16, padding: 60 };

const EMPTY_COLLECTION: GeoJSON.FeatureCollection = {
  features: [],
  type: 'FeatureCollection',
};

export function RouteMapEditor({
  path,
  readOnly,
}: {
  path: string;
  readOnly?: boolean;
}) {
  const {
    errorMessage,
    setValue: setPlanValue,
    showError,
    value: planValue,
  } = useField<RoutePlan | string | null>({ path });
  const { value: cityValue } = useField<string>({ path: 'city' });
  const { value: colorValue } = useField<string>({ path: 'color' });

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);

  const [ready, setReady] = useState(false);
  const [basemap, setBasemap] = useState<EditorBasemap>('streets');
  const [pending, setPending] = useState(0);
  const [zoom, setZoom] = useState(mapConfig.defaultView.zoom);
  const [trailCount, setTrailCount] = useState<number | null>(null);

  const controllerRef = useRef<RouteEditorController | null>(null);
  const readOnlyRef = useRef(Boolean(readOnly));
  const colorRef = useRef(colorValue || DEFAULT_ROUTE_COLOR);
  const trailsRef = useRef<GeoJSON.FeatureCollection>(EMPTY_COLLECTION);
  /** The last plan this editor wrote, so its own write isn't read back as external. */
  const writtenRef = useRef(normalized(planValue));
  const setPlanValueRef = useRef(setPlanValue);
  readOnlyRef.current = Boolean(readOnly);
  colorRef.current = colorValue || DEFAULT_ROUTE_COLOR;
  setPlanValueRef.current = setPlanValue;

  const city = isCityId(cityValue) ? cityValue : null;

  const storeRef = useRef<RouteNetworkStore | null>(null);
  if (!storeRef.current) {
    storeRef.current = new RouteNetworkStore(fetchCell, () => {
      if (!mapRef.current) return;
      setPending(storeRef.current?.pending ?? 0);
      scheduleNetworkPaint();
    });
  }

  // --- drawing ------------------------------------------------------------

  /** Pushes the loaded network into the map. */
  const paintNetwork = useCallback(() => {
    const source = mapRef.current?.getSource(NETWORK_SOURCE) as
      | mapboxgl.GeoJSONSource
      | undefined;
    source?.setData(networkCollection(storeRef.current?.allWays() ?? []));
  }, []);

  /**
   * Repaints the network once per frame at most. The store reports a change
   * when each cell starts and finishes loading, and re-uploading every loaded
   * way for each of those is real work once a few city cells are in.
   */
  const networkFrameRef = useRef<number | null>(null);
  const scheduleNetworkPaint = useCallback(() => {
    if (networkFrameRef.current !== null) {
      return;
    }
    networkFrameRef.current = requestAnimationFrame(() => {
      networkFrameRef.current = null;
      paintNetwork();
    });
  }, [paintNetwork]);

  const paintRoute = useCallback(() => {
    const map = mapRef.current;
    const source = map?.getSource(ROUTE_SOURCE) as
      | mapboxgl.GeoJSONSource
      | undefined;
    if (!map || !source) {
      return;
    }
    source.setData(
      routeCollection(controllerRef.current?.getSnapshot().plan ?? EMPTY_PLAN),
    );
    map.setPaintProperty(ROUTE_LAYER, 'line-color', colorRef.current);
  }, []);

  // --- network -------------------------------------------------------------

  if (!controllerRef.current) {
    controllerRef.current = createRouteEditorController(
      initialPlan(planValue),
      storeRef.current,
      (next) => {
        writtenRef.current = normalized(next);
        setPlanValueRef.current(next);
        paintRoute();
        paintMarkers();
      },
    );
  }
  const controller = controllerRef.current;
  controller.setReadOnly(Boolean(readOnly));
  const { plan, canUndo, canRedo, routing, note } = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );

  /** Loads what is on screen, so the curator can see what the route can use. */
  const loadView = useCallback(() => {
    const map = mapRef.current;
    if (!map || map.getZoom() < MIN_VIEW_LOAD_ZOOM) {
      return;
    }
    const bounds = map.getBounds();
    if (!bounds) {
      return;
    }
    const keys = cellsCovering([
      bounds.getWest(),
      bounds.getSouth(),
      bounds.getEast(),
      bounds.getNorth(),
    ]);
    if (keys.length <= MAX_VIEW_CELLS) {
      void controller.ensureCells(keys);
    }
  }, [controller]);

  /**
   * Rebuilds the waypoint markers. Plans hold at most a couple of hundred
   * waypoints, so replacing them all is simpler than diffing, and it only
   * happens on discrete edits — never during a drag.
   */
  const paintMarkers = useCallback(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }
    for (const marker of markersRef.current) {
      marker.remove();
    }
    const waypoints = controller.getSnapshot().plan.waypoints;
    markersRef.current = waypoints.map((point, index) => {
      const element = document.createElement('div');
      element.className = cn(
        'flex h-6 w-6 cursor-grab items-center justify-center rounded-full border-2 border-solid border-white text-[11px] font-bold text-white shadow-md',
        index === 0
          ? 'bg-green-600'
          : index === waypoints.length - 1
            ? 'bg-red-600'
            : 'bg-blue-600',
      );
      element.textContent = String(index + 1);
      element.title = 'Drag to move · right-click to remove';
      element.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        if (!readOnlyRef.current) {
          void controller.removeWaypoint(index, point);
        }
      });

      const marker = new mapboxgl.Marker({
        draggable: !readOnlyRef.current,
        element,
      })
        .setLngLat(point)
        .addTo(map);
      marker.on('dragend', () => {
        const { lat, lng } = marker.getLngLat();
        void controller.moveWaypoint(index, point, [lng, lat]);
      });
      return marker;
    });
  }, [controller]);

  const handleMapClick = useCallback(
    (event: mapboxgl.MapMouseEvent) => {
      const map = mapRef.current;
      const target = event.originalEvent.target;
      if (
        !map ||
        readOnlyRef.current ||
        (target instanceof Element && target.closest('.mapboxgl-marker'))
      )
        return;
      const hit = map.queryRenderedFeatures(event.point, {
        layers: [ROUTE_HIT_LAYER],
      })[0];
      const legIndex = Number(hit?.properties?.leg);
      void controller.addWaypoint(
        [event.lngLat.lng, event.lngLat.lat],
        Number.isInteger(legIndex) ? legIndex : undefined,
      );
    },
    [controller],
  );

  // --- the map -------------------------------------------------------------

  /**
   * Builds the map. Runs **once** — every dependency is a stable callback; see
   * the note at the top of the file.
   */
  useEffect(() => {
    if (
      !containerRef.current ||
      mapRef.current ||
      !mapConfig.mapbox.accessToken
    ) {
      return;
    }
    const view = initialView(
      controller.getSnapshot().plan,
      cityValueAtMount(cityValue),
    );
    const map = createEditorMap(containerRef.current, view);
    mapRef.current = map;
    controller.activate();
    map.doubleClickZoom.disable();

    // Fires on first load and after every basemap switch, which discards our
    // sources and layers along with the old style.
    map.on('style.load', () => {
      installLayers(map, trailsRef.current, colorRef.current);
      paintNetwork();
      paintRoute();
      setReady(true);
      // `moveend` doesn't fire for the starting camera, so the opening view
      // would otherwise show no network until the curator pans.
      loadView();
    });
    map.on('click', (event) => {
      void handleMapClick(event);
    });
    map.on('mouseenter', ROUTE_HIT_LAYER, () => {
      if (!readOnlyRef.current) {
        map.getCanvas().style.cursor = 'copy';
      }
    });
    map.on('mouseleave', ROUTE_HIT_LAYER, () => {
      map.getCanvas().style.cursor = '';
    });
    map.on('moveend', () => {
      setZoom(map.getZoom());
      loadView();
    });

    paintMarkers();
    return () => {
      controller.dispose();
      if (networkFrameRef.current !== null) {
        cancelAnimationFrame(networkFrameRef.current);
        networkFrameRef.current = null;
      }
      for (const marker of markersRef.current) {
        marker.remove();
      }
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
    // `cityValue` is read once for the starting view and deliberately not a
    // dependency: a change must not tear the map down.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    controller,
    handleMapClick,
    loadView,
    paintMarkers,
    paintNetwork,
    paintRoute,
  ]);

  // Curated trails for the route's city: drawn, and routed over.
  useEffect(() => {
    if (!city) {
      return;
    }
    const controller = new AbortController();
    fetch(`/api/map/trails?city=${city}`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : EMPTY_COLLECTION))
      .then((collection: GeoJSON.FeatureCollection) => {
        trailsRef.current = collection;
        const trails = curatedTrails(collection);
        storeRef.current?.setTrails(trails);
        setTrailCount(trails.length);
        const source = mapRef.current?.getSource(TRAILS_SOURCE) as
          | mapboxgl.GeoJSONSource
          | undefined;
        source?.setData(collection);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setTrailCount(0);
          console.error('Could not load trails for the route editor', error);
        }
      });
    return () => controller.abort();
  }, [city]);

  // A plan arriving from outside the editor — the document loading, or a save
  // coming back — replaces the working copy and its history.
  useEffect(() => {
    if (normalized(planValue) === writtenRef.current) {
      return;
    }
    const incoming = initialPlan(planValue);
    writtenRef.current = normalized(incoming);
    controller.replacePlan(incoming);
    paintRoute();
    paintMarkers();
  }, [controller, paintMarkers, paintRoute, planValue]);

  // The route draws in its own colour.
  useEffect(() => {
    if (ready) {
      paintRoute();
    }
  }, [colorValue, paintRoute, ready]);

  useEditorBasemap(mapRef, basemap);

  const fitRoute = useCallback(() => {
    const bounds = boundsOf(
      controller.getSnapshot().plan.legs.map((leg) => leg.coordinates),
    );
    if (bounds) {
      mapRef.current?.fitBounds(bounds, FIT_OPTIONS);
    }
  }, [controller]);

  // --- render --------------------------------------------------------------

  const steps = useMemo(
    () => withKeys(planSteps(plan), (step) => stepLabel(step)),
    [plan],
  );
  const waypoints = useMemo(
    () => withKeys(plan.waypoints, (point) => `${point[0]},${point[1]}`),
    [plan],
  );
  const miles = planMeters(plan) * METERS_TO_MILES;
  // Edits draw a straight placeholder until the router answers; those are
  // not failures yet, so nothing is reported while routing is in flight.
  const unroutedCount =
    routing > 0 ? 0 : plan.legs.filter((leg) => leg.isUnrouted).length;
  const editable = !readOnly;

  if (!mapConfig.mapbox.accessToken) {
    return (
      <div className="field-type">
        <p>
          Set <code>NEXT_PUBLIC_MAPBOX_TOKEN</code> to build routes on the map.
        </p>
      </div>
    );
  }

  return (
    <div className="field-type">
      <div className="field-label">Route</div>

      <div
        aria-label="Route tools"
        className="mb-2 flex flex-wrap items-center gap-1.5"
        role="group"
      >
        <ToolButton
          disabled={!editable || !canUndo}
          label="Undo"
          onClick={() => controller.undo()}
        />
        <ToolButton
          disabled={!editable || !canRedo}
          label="Redo"
          onClick={() => controller.redo()}
        />
        <ToolButton
          disabled={!editable || plan.waypoints.length < 2}
          label="Reverse"
          onClick={() => void controller.reverse()}
        />
        <ToolButton
          disabled={!editable || plan.waypoints.length < 2}
          label="Back to start"
          onClick={() => void controller.closeLoop()}
        />
        <ToolButton
          disabled={plan.legs.length === 0}
          label="Fit route"
          onClick={fitRoute}
        />
        <ToolButton
          disabled={!editable || plan.waypoints.length === 0}
          label="Clear"
          onClick={() => {
            if (window.confirm('Remove every waypoint from this route?')) {
              void controller.clear();
            }
          }}
        />
        <span className="flex-1" />
        <ToolButton
          active={basemap === 'satellite'}
          label="Satellite"
          onClick={() =>
            setBasemap((current) =>
              current === 'satellite' ? 'streets' : 'satellite',
            )
          }
        />
      </div>

      {showError && errorMessage && (
        <Banner tone="error">{errorMessage}</Banner>
      )}
      {note && <Banner tone="warning">{note}</Banner>}
      {unroutedCount > 0 && (
        <Banner tone="warning">
          {unroutedCount === 1 ? 'One leg' : `${unroutedCount} legs`} could not
          be routed along trails or roads and{' '}
          {unroutedCount === 1 ? 'is' : 'are'} drawn as a dashed straight line.
          Add a waypoint on a connecting trail or road, or mark the leg as a
          straight line on purpose.
        </Banner>
      )}

      <div className="relative">
        <div
          className="h-[520px] w-full rounded-[var(--style-radius-s,4px)] border border-solid border-[color:var(--theme-elevation-150)]"
          ref={containerRef}
        />
        <div className="pointer-events-none absolute bottom-2 left-2 flex flex-col gap-1 text-[0.75rem]">
          {(pending > 0 || routing > 0) && (
            <span className="rounded bg-white/90 px-2 py-0.5 text-gray-800 shadow">
              {pending > 0 ? 'Loading trails and roads…' : 'Routing…'}
            </span>
          )}
          {zoom < MIN_NETWORK_ZOOM && (
            <span className="rounded bg-white/90 px-2 py-0.5 text-gray-800 shadow">
              Zoom in to see the roads and paths a route can use
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 py-2 text-[0.85rem]">
        <strong>
          {plan.waypoints.length === 0
            ? 'No route yet'
            : `${miles.toFixed(2)} mi · ${plan.waypoints.length} waypoint${plan.waypoints.length === 1 ? '' : 's'}`}
        </strong>
        {trailCount !== null && (
          <span className="text-[color:var(--theme-elevation-600)]">
            {trailCount} published trail{trailCount === 1 ? '' : 's'} available
          </span>
        )}
      </div>

      <p className="mb-3 mt-0 max-w-[75ch] text-[0.8rem] text-[color:var(--theme-elevation-600)] leading-[1.45]">
        Click the map to add waypoints; the route follows trails and roads
        between them, preferring published trails and bike paths. To use part of
        a trail, put waypoints where you join and leave it. Drag a waypoint to
        move it, click the route to add one in between, or right-click a
        waypoint to remove it. Distance is measured when you save.
      </p>

      {steps.length > 0 && (
        <section className="mb-3">
          <h4 className="mb-1 mt-0 text-[0.85rem]">Rides on</h4>
          <ol className="m-0 pl-5 text-[0.85rem]">
            {steps.map(({ item: step, key }) => (
              <li className="mb-0.5" key={key}>
                {stepLabel(step)}{' '}
                <span className="text-[color:var(--theme-elevation-600)]">
                  {(step.meters * METERS_TO_MILES).toFixed(2)} mi
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {plan.waypoints.length > 0 && (
        <section>
          <h4 className="mb-1 mt-0 text-[0.85rem]">Waypoints and legs</h4>
          <ol className="m-0 list-none p-0 text-[0.85rem]">
            {waypoints.map(({ item: point, key }, index) => {
              const leg = plan.legs[index];
              return (
                <li key={key}>
                  <div className="flex items-center gap-2 py-0.5">
                    <strong>{index + 1}</strong>
                    <span className="text-[color:var(--theme-elevation-600)]">
                      {point[1].toFixed(5)}, {point[0].toFixed(5)}
                    </span>
                    <button
                      className="border-0 bg-transparent p-0 text-[0.8rem] text-[color:var(--theme-error-500,#c00)] underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={!editable}
                      onClick={() => void controller.removeWaypoint(index)}
                      type="button"
                    >
                      Remove
                    </button>
                  </div>
                  {leg && (
                    <div className="ml-4 flex flex-wrap items-center gap-3 border-0 border-l-2 border-solid border-[color:var(--theme-elevation-150)] py-1 pl-3 text-[0.8rem]">
                      <span>
                        Leg {index + 1}:{' '}
                        {(legMeters(leg) * METERS_TO_MILES).toFixed(2)} mi
                        {leg.isUnrouted && routing === 0 && (
                          <span className="ml-1 text-[color:var(--theme-warning-600,#b45309)]">
                            · not connected
                          </span>
                        )}
                      </span>
                      <label className="flex items-center gap-1">
                        <input
                          checked={leg.mode === 'straight'}
                          disabled={!editable}
                          onChange={(event) =>
                            void controller.setLegMode(
                              index,
                              event.target.checked ? 'straight' : 'network',
                            )
                          }
                          type="checkbox"
                        />
                        Straight line
                      </label>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      )}
    </div>
  );
}

function ToolButton({
  active,
  disabled,
  label,
  onClick,
}: {
  active?: boolean;
  disabled?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-pressed={active}
      className={cn(
        'rounded-[var(--style-radius-s,4px)] border border-solid border-[color:var(--theme-elevation-150)] px-2.5 py-1 text-[0.8rem] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--theme-elevation-800)] disabled:cursor-not-allowed disabled:opacity-50',
        active
          ? 'bg-[var(--theme-elevation-800)] text-[color:var(--theme-elevation-0)]'
          : 'bg-[var(--theme-elevation-50)] text-[color:var(--theme-elevation-800)] hover:bg-[var(--theme-elevation-100)]',
      )}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

async function fetchCell(key: CellKey): Promise<NetworkWay[]> {
  const response = await fetch(`/api/routes/network?cell=${key}`, {
    credentials: 'include',
  });
  const body = (await response.json().catch(() => ({}))) as Partial<
    RouteNetworkResponse & { message: string }
  >;
  if (!response.ok) {
    throw new Error(body.message ?? `HTTP ${response.status}`);
  }
  return body.ways ?? [];
}

function initialPlan(value: unknown): RoutePlan {
  return parseRoutePlan(value).plan ?? EMPTY_PLAN;
}

/** A plan as the server will store it, for telling our own writes apart. */
function normalized(value: unknown): string {
  return JSON.stringify(initialPlan(value));
}

function cityValueAtMount(value: unknown) {
  return isCityId(value) ? value : null;
}

type InitialView = Pick<
  mapboxgl.MapOptions,
  'bounds' | 'center' | 'fitBoundsOptions' | 'zoom'
>;

function initialView(
  plan: RoutePlan,
  city: ReturnType<typeof cityValueAtMount>,
): InitialView {
  const bounds = boundsOf([
    ...plan.legs.map((leg) => leg.coordinates),
    plan.waypoints,
  ]);
  if (bounds) {
    return { bounds, fitBoundsOptions: FIT_OPTIONS };
  }
  const view = (city ? cityConfigs[city] : mapConfig).defaultView;
  return { center: view.center, zoom: view.zoom };
}

function installLayers(
  map: mapboxgl.Map,
  trails: GeoJSON.FeatureCollection,
  routeColor: string,
) {
  map.addSource(NETWORK_SOURCE, { data: EMPTY_COLLECTION, type: 'geojson' });
  map.addSource(TRAILS_SOURCE, { data: trails, type: 'geojson' });
  map.addSource(ROUTE_SOURCE, { data: EMPTY_COLLECTION, type: 'geojson' });

  map.addLayer({
    id: NETWORK_LAYER,
    minzoom: MIN_NETWORK_ZOOM - 1,
    paint: {
      'line-color': [
        'match',
        ['get', 'class'],
        ['cycleway', 'path'],
        '#7C3AED',
        ['primary', 'secondary'],
        '#F97316',
        '#9CA3AF',
      ],
      'line-dasharray': [
        'case',
        ['==', ['get', 'class'], 'path'],
        ['literal', [2, 1]],
        ['literal', [1, 0]],
      ],
      'line-opacity': 0.55,
      'line-width': ['interpolate', ['linear'], ['zoom'], 12, 1, 16, 3],
    },
    source: NETWORK_SOURCE,
    type: 'line',
  });
  map.addLayer({
    id: TRAILS_LAYER,
    paint: {
      'line-color': TRAIL_COLOR,
      'line-opacity': 0.8,
      'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1.5, 16, 4],
    },
    source: TRAILS_SOURCE,
    type: 'line',
  });
  map.addLayer({
    id: ROUTE_CASING_LAYER,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#FFFFFF', 'line-width': 8 },
    source: ROUTE_SOURCE,
    type: 'line',
  });
  map.addLayer({
    id: ROUTE_LAYER,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': routeColor,
      'line-dasharray': [
        'case',
        ['get', 'straight'],
        ['literal', [1.5, 1.5]],
        ['literal', [1, 0]],
      ],
      'line-width': 4.5,
    },
    source: ROUTE_SOURCE,
    type: 'line',
  });
  // Wide and transparent: the route line is too thin to click reliably.
  map.addLayer({
    id: ROUTE_HIT_LAYER,
    paint: { 'line-color': '#000000', 'line-opacity': 0, 'line-width': 18 },
    source: ROUTE_SOURCE,
    type: 'line',
  });
}

function networkCollection(ways: NetworkWay[]): GeoJSON.FeatureCollection {
  return {
    features: ways.map((way) => ({
      geometry: { coordinates: way.coordinates, type: 'LineString' },
      properties: { class: way.class, name: way.name },
      type: 'Feature',
    })),
    type: 'FeatureCollection',
  };
}

function routeCollection(plan: RoutePlan): GeoJSON.FeatureCollection {
  return {
    features: plan.legs.map((leg, index) => ({
      geometry: { coordinates: leg.coordinates, type: 'LineString' },
      properties: {
        leg: index,
        straight: leg.mode === 'straight' || Boolean(leg.isUnrouted),
      },
      type: 'Feature',
    })),
    type: 'FeatureCollection',
  };
}

/** The public trail GeoJSON, as the router's curated trails. */
function curatedTrails(collection: GeoJSON.FeatureCollection): CuratedTrail[] {
  return collection.features.flatMap((feature) => {
    const properties = feature.properties ?? {};
    const name = String(properties.Trail ?? '');
    const slug = String(properties.slug ?? '');
    const geometry = feature.geometry;
    const parts =
      geometry?.type === 'LineString'
        ? [geometry.coordinates]
        : geometry?.type === 'MultiLineString'
          ? geometry.coordinates
          : [];
    return name && slug && parts.length > 0
      ? [{ name, parts: parts as Position[][], slug }]
      : [];
  });
}

function stepLabel(step: RouteStep): string {
  switch (step.source.kind) {
    case 'trail':
      return step.source.name;
    case 'osm':
      return step.source.name ?? unnamed(step.source.class);
    case 'straight':
      return 'Straight line';
    default:
      return 'Connector';
  }
}

function unnamed(wayClass: string): string {
  switch (wayClass) {
    case 'cycleway':
      return 'Unnamed bike path';
    case 'path':
    case 'footway':
      return 'Unnamed path';
    default:
      return 'Unnamed road';
  }
}

function legMeters(leg: RouteLeg): number {
  return leg.steps.reduce((total, step) => total + step.meters, 0);
}

/**
 * Pairs each item with a key built from its content plus how many times that
 * content has appeared so far — stable across re-renders without leaning on
 * array position, and unique even for a loop's repeated start point.
 */
function withKeys<T>(
  items: T[],
  contentKey: (item: T) => string,
): { item: T; key: string }[] {
  const seen = new Map<string, number>();
  return items.map((item) => {
    const base = contentKey(item);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return { item, key: `${base}#${count}` };
  });
}

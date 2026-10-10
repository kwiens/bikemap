// Custom DOM events for component communication.
//
// The map, the sidebar, the rides panel and the elevation pane are siblings
// that never share React state; they talk over `window` events. Every event
// name lives in MAP_EVENTS and every payload shape in MapEventDetails, so a
// dispatcher and its listeners agree at compile time. Use `dispatchMapEvent`
// and `onMapEvent` (or the `useMapEvent` hook) rather than `new CustomEvent`
// and `addEventListener` directly — the raw forms take any detail at all,
// and a payload mismatch between two files was a reliable source of glitches.

import type { ElevationProfile } from '@/data/mountain-bike-trails';
import type { LocationProps } from '@/components/sidebar/types';
import type { RideStyle } from '@/utils/settings';

export const MAP_EVENTS = {
  ROUTE_SELECT: 'route-select',
  ROUTE_DESELECT: 'route-deselect',
  TRAIL_SELECT: 'trail-select',
  TRAIL_DESELECT: 'trail-deselect',
  // OSM trail selected on the map — carries a ready-built ElevationProfile for
  // the elevation pane (OSM trails have no curated JSON to load by name).
  OSM_TRAIL_SELECT: 'osm-trail-select',
  AREA_SELECT: 'area-select',
  LAYER_TOGGLE: 'layer-toggle',
  CENTER_LOCATION: 'center-location',
  SIDEBAR_TOGGLE: 'sidebar-toggle',
  ELEVATION_HOVER: 'elevation-hover',
  LOCATION_UPDATE: 'location-update',
  RIDE_STYLE_CHOSEN: 'ride-style-chosen',
  RIDE_RECORDING_START: 'ride-recording-start',
  RIDE_RECORDING_STOP: 'ride-recording-stop',
  RIDE_RECORDING_UPDATE: 'ride-recording-update',
  RIDE_SELECT: 'ride-select',
  RIDE_DESELECT: 'ride-deselect',
  RIDES_PANEL_TOGGLE: 'rides-panel-toggle',
  TOAST: 'toast',
  MAP_READY: 'map-ready',
} as const;

export type MapEventName = (typeof MAP_EVENTS)[keyof typeof MAP_EVENTS];

/** Marker layers are a radio group in the map; the two line overlays toggle
 *  independently. See `handleLayerToggle` in Map.tsx. */
export type MarkerLayerId = 'attractions' | 'bikeResources' | 'bikeRentals';
export type MapLayerId = MarkerLayerId | 'osmTrails' | 'bikeNetwork';

export type LngLat = [lng: number, lat: number];

/** Live ride track updates: one point per GPS fix, or a whole-track replace
 *  when a recording is continued after a crash. */
export type RideRecordingUpdateDetail =
  | { point: LngLat; segmentStart: boolean; segments?: undefined }
  | { segments: LngLat[][]; point?: undefined };

/**
 * The payload each event carries. `undefined` means the event has no detail.
 * Keyed by the event name string (not the MAP_EVENTS key) so `dispatchMapEvent`
 * and `onMapEvent` can be called with `MAP_EVENTS.X` and still resolve the
 * detail type.
 */
export interface MapEventDetails {
  'route-select': { routeId: string };
  'route-deselect': undefined;
  /** `autoDetected` marks a selection made by the recorder's trail detection
   *  rather than the rider, so the map doesn't fly away from them. */
  'trail-select': { trailName: string; autoDetected?: boolean };
  'trail-deselect': undefined;
  'osm-trail-select': { profile: ElevationProfile };
  'area-select': { areaName: string };
  'layer-toggle': { layer: MapLayerId; visible: boolean };
  'center-location': { location: LocationProps };
  'sidebar-toggle': { isOpen: boolean };
  /** `null` coordinates clear the hover marker. */
  'elevation-hover': { lng: number | null; lat: number | null };
  'location-update': { lng: number; lat: number };
  'ride-style-chosen': { style: RideStyle };
  'ride-recording-start': undefined;
  /** `rideId` is present only when the stop produced a saved ride. */
  'ride-recording-stop': { rideId?: string };
  'ride-recording-update': RideRecordingUpdateDetail;
  /** `openPanel` asks the rides panel to open itself (elevation pane title). */
  'ride-select': { rideId: string; openPanel?: boolean };
  'ride-deselect': undefined;
  'rides-panel-toggle': { isOpen: boolean };
  toast: { message: string };
  'map-ready': undefined;
}

type DetailArgs<K extends MapEventName> = MapEventDetails[K] extends undefined
  ? []
  : [detail: MapEventDetails[K]];

/** Dispatch a map event on `window`, with its detail checked against
 *  MapEventDetails. Events without a detail take one argument. */
export function dispatchMapEvent<K extends MapEventName>(
  name: K,
  ...args: DetailArgs<K>
): void {
  const [detail] = args;
  window.dispatchEvent(
    detail === undefined ? new Event(name) : new CustomEvent(name, { detail }),
  );
}

/**
 * Listen for a map event. Returns the unsubscribe function, so it can be
 * returned straight from a `useEffect` or collected for a manual teardown.
 */
export function onMapEvent<K extends MapEventName>(
  name: K,
  handler: (detail: MapEventDetails[K]) => void,
  options?: { once?: boolean },
): () => void {
  const listener = (event: Event) => {
    handler((event as CustomEvent<MapEventDetails[K]>).detail);
  };
  if (options) {
    window.addEventListener(name, listener, options);
  } else {
    window.addEventListener(name, listener);
  }
  return () => window.removeEventListener(name, listener);
}

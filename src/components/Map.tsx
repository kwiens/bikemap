'use client';

import { useEffect, useRef, useState, memo, useCallback } from 'react';
import dynamic from 'next/dynamic';
import mapboxgl from 'mapbox-gl';
import { MapLegendProvider } from '@/components/MapLegend';
import { EmbedAttribution } from '@/components/EmbedAttribution';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import { useEmbed } from '@/components/EmbedContext';

import {
  bikeRoutes,
  mapFeatures,
  bikeResources,
  mountainBikeTrails,
  hiddenStyleLayerIds,
  trailMetadata,
  bikeNetworkUrl,
  bikeRoutesUrl,
} from '@/data/geo_data';
import {
  createLocationMarker,
  updateAccuracyCircle,
  createAttractionMarker,
  createBikeResourceMarker,
  createBikeRentalMarker,
  createHighlightMarker,
  ensureFontAwesomeLoaded,
  MarkerManager,
} from '@/components/MapMarkers';
import { ElevationProfile } from '@/components/sidebar/ElevationProfile';
import { cn } from '@/lib/utils';
import { useToast, useMapResize, useWakeLock } from '@/hooks';
import { fetchBikeRentalLocations } from '@/data/gbfs';
import {
  geocodeAddress,
  updateRouteOpacity,
  flyToBounds,
  calculateRouteBounds,
  findLocationInArray,
  calculateTrailBounds,
  initTrailBoundsFromDefaults,
  initRouteBoundsFromDefaults,
  getAreaBounds,
  updateMtnBikeOpacity,
  highlightMtnBikeArea,
  initMtnBikeColors,
  initMtnBikeLayers,
  ensureMtnBikeSource,
  ensureOsmTrailsSource,
  setOsmTrailsVisible,
  ensureBikeNetworkSource,
  setBikeNetworkVisible,
  ensureInlineRoutes,
  registerOsmTrailSelection,
  hideStyleLayers,
  hideStrayStyleLayers,
  TRAIL_LAYERS,
  trailNameForOsmId,
  addRideLayer,
  updateRideLayer,
  removeRideLayer,
  detectTrailAtPoint,
  toLngLatBounds,
} from '@/utils/map';
import { loadRide } from '@/utils/ride-storage';
import { splitRideSegments } from '@/data/ride';
import { mapConfig } from '@/config/map.config';
import { MAP_EVENTS } from '@/events';
import { clearMapReady, setMapReady } from '@/utils/map-ready';
import { HeadingSmoother } from '@/utils/compass';

// Ride recording is unreachable in embed mode, and its subtree (history, GPX,
// ride stats and storage) is a sizeable chunk to make a partner's page
// download. Loading it lazily keeps it out of the /embed request entirely.
const RidesPanel = dynamic(
  () => import('@/components/RidesPanel').then((m) => m.RidesPanel),
  { ssr: false },
);

// Recenter pause durations: how long to suppress auto-centering after
// programmatic fly-to animations vs user gestures (drag, zoom, scroll).
const PAUSE_FLY_MS = 5000;
const PAUSE_GESTURE_MS = 10000;

// Initialize Mapbox access token from config
mapboxgl.accessToken = mapConfig.mapbox.accessToken;

// NEXT_PUBLIC_* values are inlined at build time, so a deployment built before
// the variable was set stays broken until it is rebuilt — no amount of fixing
// the dashboard changes an existing build.
const hasMapboxToken = Boolean(mapConfig.mapbox.accessToken);

if (!hasMapboxToken) {
  console.warn(
    'NEXT_PUBLIC_MAPBOX_TOKEN is not set — the map will fail to load. ' +
      'Copy .env.example to .env.local and add a Mapbox token. ' +
      'On a deployment, set it for this environment and then redeploy: the ' +
      'token is baked in at build time, so an existing build keeps failing.',
  );
}

// MapboxMap component - isolated from UI state changes
const MapboxMap = memo(function MapboxMap() {
  const { isEmbed, options: embedOptions } = useEmbed();
  // Embed mode is fixed for the lifetime of the tree, but the init effect runs
  // once on mount and must not list it as a dependency.
  const isEmbedRef = useRef(isEmbed);
  isEmbedRef.current = isEmbed;
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const locationMarker = useRef<mapboxgl.Marker | null>(null);
  const locationAccuracy = useRef<number>(0);
  const watchId = useRef<number | null>(null);
  const locationWatch = useRef<NodeJS.Timeout | undefined>(undefined);
  const [watchingLocation, setWatchingLocation] = useState(false);
  const [compassMode, setCompassMode] = useState(false);
  const compassHeading = useRef<number | null>(null);
  const compassCleanup = useRef<(() => void) | null>(null);
  // Removes the OSM trail selection's window listeners on teardown/restyle.
  const osmSelectionCleanup = useRef<(() => void) | null>(null);
  // GPS heading/speed for velocity-aware compass smoothing
  const gpsHeading = useRef<{ heading: number; speed: number } | null>(null);
  const pendingLocationListener = useRef<((e: Event) => void) | null>(null);
  const [recordingActive, setRecordingActive] = useState(false);
  // Set when init throws or the style errors — a token can be present but
  // revoked, which `hasMapboxToken` (a build-time constant) cannot detect.
  const [mapFailed, setMapFailed] = useState(false);

  // Track markers for attractions and bike resources
  const attractionMarkers = useRef<MarkerManager>(new MarkerManager());
  const bikeResourceMarkers = useRef<MarkerManager>(new MarkerManager());
  const bikeRentalMarkers = useRef<MarkerManager>(new MarkerManager());
  // Tracks the latest desired visibility of the rentals layer so a slow GBFS
  // fetch can't re-show markers after the user has toggled the layer back off.
  const bikeRentalsVisibleRef = useRef(false);
  // Tracks all marker-layer visibility so route dimming can be computed from
  // "any marker layer visible" — independent of the order the sidebar
  // dispatches its radio-toggle OFF/ON events.
  const markerLayersVisibleRef = useRef({
    attractions: false,
    bikeResources: false,
    bikeRentals: false,
  });
  // Desired OSM-trails visibility, tracked in a ref so a toggle flipped before
  // the style finishes loading can be replayed once the layers are attached.
  const osmTrailsVisibleRef = useRef(false);
  const bikeNetworkVisibleRef = useRef(false);

  // Trail auto-detection during ride recording
  const autoDetectEnabledRef = useRef(false);
  const autoDetectedTrailRef = useRef<string | null>(null);
  const lastDetectTimeRef = useRef(0);
  const detectCandidateRef = useRef<string | null>(null);
  const detectConfirmCountRef = useRef(0);
  const isRecordingRef = useRef(false);
  const pauseRecenterUntil = useRef<number>(0);

  // Use custom hooks
  const {
    message: toastMessage,
    isFadingOut: toastFadingOut,
    showToast,
  } = useToast();
  useMapResize({ map });
  // Keep screen awake while location tracking or recording is active.
  // Both are needed: recording keeps the lock even when the user drags the map
  // (which sets watchingLocation=false to stop auto-centering).
  useWakeLock(watchingLocation || recordingActive);

  // Handle ride select — show ride on map
  const handleRideSelect = useCallback(async (event: CustomEvent) => {
    if (!map.current) return;
    const { rideId } = event.detail;
    const ride = await loadRide(rideId);
    if (!ride) return;

    const segments = splitRideSegments(ride.points).map((segment) =>
      segment.map((p) => [p.lng, p.lat] as [number, number]),
    );
    addRideLayer(map.current, segments);

    // Dim other routes/trails
    updateRouteOpacity(map.current, bikeRoutes, null, {
      selected: 0.1,
      unselected: 0.1,
    });
    updateMtnBikeOpacity(map.current, null);

    // Fly to ride bounds
    const [swLng, swLat, neLng, neLat] = ride.bounds;
    const bounds = new mapboxgl.LngLatBounds([swLng, swLat], [neLng, neLat]);
    pauseRecenterUntil.current = Date.now() + PAUSE_FLY_MS;
    flyToBounds(map.current, bounds);
  }, []);

  // Handle ride deselect — remove ride from map
  const handleRideDeselect = useCallback(() => {
    if (!map.current) return;
    removeRideLayer(map.current);
    updateRouteOpacity(map.current, bikeRoutes, null, {
      selected: 1,
      unselected: 1,
    });
    updateMtnBikeOpacity(map.current, null);
  }, []);

  // Set up ride select/deselect event listeners
  useEffect(() => {
    const selectHandler = (e: Event) => handleRideSelect(e as CustomEvent);
    const deselectHandler = () => handleRideDeselect();
    const liveSegments: [number, number][][] = [[]];
    let updateSkip = 0;
    const DETECT_INTERVAL_MS = 3000;
    const DETECT_CONFIRM_COUNT = 3; // ~9s before first auto-select
    const DETECT_SWITCH_COUNT = 5; // ~15s before switching or clearing

    const updateHandler = (e: Event) => {
      if (!map.current) return;
      const detail = (e as CustomEvent).detail;

      // Batch restore (continueRide) — replace all segments and render once
      if (detail.segments) {
        liveSegments.length = 0;
        liveSegments.push(...(detail.segments as [number, number][][]));
        updateRideLayer(map.current, liveSegments);
        return;
      }

      const { point, segmentStart } = detail;
      if (segmentStart && liveSegments[liveSegments.length - 1].length > 0) {
        liveSegments.push([]);
      }
      liveSegments[liveSegments.length - 1].push(point);
      // Throttle Mapbox setData to every 3rd point
      updateSkip++;
      const pointCount = liveSegments.reduce(
        (count, segment) => count + segment.length,
        0,
      );
      if (pointCount >= 2 && updateSkip >= 3) {
        updateRideLayer(map.current, liveSegments);
        updateSkip = 0;
      }

      // Trail auto-detection (throttled)
      if (!autoDetectEnabledRef.current) return;
      const now = Date.now();
      if (now - lastDetectTimeRef.current < DETECT_INTERVAL_MS) return;
      lastDetectTimeRef.current = now;

      const detected = detectTrailAtPoint(map.current, point);
      const threshold =
        autoDetectedTrailRef.current === null
          ? DETECT_CONFIRM_COUNT
          : DETECT_SWITCH_COUNT;

      if (detected === detectCandidateRef.current) {
        detectConfirmCountRef.current++;
      } else {
        detectCandidateRef.current = detected;
        detectConfirmCountRef.current = 1;
      }

      if (detectConfirmCountRef.current < threshold) return;

      if (detected !== null && detected !== autoDetectedTrailRef.current) {
        autoDetectedTrailRef.current = detected;
        window.dispatchEvent(
          new CustomEvent(MAP_EVENTS.TRAIL_SELECT, {
            detail: { trailName: detected, autoDetected: true },
          }),
        );
      } else if (detected === null && autoDetectedTrailRef.current !== null) {
        autoDetectedTrailRef.current = null;
        window.dispatchEvent(new CustomEvent(MAP_EVENTS.TRAIL_DESELECT));
      }
    };
    const stopHandler = () => {
      // Flush any unrendered points so the full route is briefly visible
      const pointCount = liveSegments.reduce(
        (count, segment) => count + segment.length,
        0,
      );
      if (map.current && pointCount >= 2) {
        updateRideLayer(map.current, liveSegments);
      }
      liveSegments.length = 0;
      liveSegments.push([]);
      if (map.current) removeRideLayer(map.current);
    };

    window.addEventListener(MAP_EVENTS.RIDE_SELECT, selectHandler);
    window.addEventListener(MAP_EVENTS.RIDE_DESELECT, deselectHandler);
    window.addEventListener(MAP_EVENTS.RIDE_RECORDING_UPDATE, updateHandler);
    window.addEventListener(MAP_EVENTS.RIDE_RECORDING_STOP, stopHandler);

    return () => {
      window.removeEventListener(MAP_EVENTS.RIDE_SELECT, selectHandler);
      window.removeEventListener(MAP_EVENTS.RIDE_DESELECT, deselectHandler);
      window.removeEventListener(
        MAP_EVENTS.RIDE_RECORDING_UPDATE,
        updateHandler,
      );
      window.removeEventListener(MAP_EVENTS.RIDE_RECORDING_STOP, stopHandler);
    };
  }, [handleRideSelect, handleRideDeselect]);

  // Create location marker
  function initializeLocationMarker() {
    // Idempotent: never start a second geolocation watch. The GPS watch is
    // started lazily on explicit user intent (tracking toggle / ride recording),
    // not on map load — requesting location before the user asks is a privacy
    // and battery regression.
    if (watchId.current !== null) return;

    // Options to request frequent, high-accuracy GPS updates
    const gpsOptions = {
      enableHighAccuracy: true, // Use GPS instead of WiFi/cell tower
      maximumAge: 0, // Don't use cached positions
      timeout: 5000, // 5 second timeout per update
    };

    // Store the watch ID for proper cleanup
    const id = navigator.geolocation.watchPosition(
      (position) => {
        if (!map.current) {
          return;
        }

        if (!locationMarker.current) {
          // First time: create marker but DON'T auto-center (user must click tracking button)
          locationMarker.current = createLocationMarker(
            position.coords.longitude,
            position.coords.latitude,
          );
          locationMarker.current.addTo(map.current);
          // Note: NOT calling flyTo here - user can manually enable tracking if desired
        } else {
          // Subsequent updates: just move the marker, don't re-center the map
          locationMarker.current?.setLngLat({
            lng: position.coords.longitude,
            lat: position.coords.latitude,
          });
        }

        // Update accuracy circle
        locationAccuracy.current = position.coords.accuracy;
        if (locationMarker.current) {
          updateAccuracyCircle(
            locationMarker.current,
            position.coords.accuracy,
            map.current.getZoom(),
          );
        }

        // Store GPS heading/speed for velocity-aware compass smoothing
        if (
          position.coords.speed !== null &&
          position.coords.heading !== null &&
          position.coords.speed > 0
        ) {
          gpsHeading.current = {
            heading: position.coords.heading,
            speed: position.coords.speed,
          };
        } else {
          gpsHeading.current = null;
        }

        // Broadcast location for elevation profile tracking
        window.dispatchEvent(
          new CustomEvent(MAP_EVENTS.LOCATION_UPDATE, {
            detail: {
              lng: position.coords.longitude,
              lat: position.coords.latitude,
            },
          }),
        );
      },
      (error) => {
        // Timeouts (code 3) are routine indoors/under tree cover — keep the
        // marker and wait for the next fix. Only tear down when the position is
        // genuinely unavailable or permission was revoked.
        if (error.code === error.TIMEOUT) {
          return;
        }
        if (locationMarker.current) {
          locationMarker.current.remove();
          locationMarker.current = null;
        }
      },
      gpsOptions,
    ); // Pass options to request frequent updates

    // Store it so we can clear it on cleanup
    watchId.current = id;
  }

  // Pause auto-centering (but keep tracking/compass mode active) when the
  // user interacts with the map via drag, pinch-zoom, or scroll-wheel.
  function initializeGestureWatch() {
    if (!map.current) return;

    const pauseRecenter = () => {
      pauseRecenterUntil.current = Date.now() + PAUSE_GESTURE_MS;
    };

    map.current.on('dragstart', pauseRecenter);
    map.current.on('wheel', pauseRecenter);
  }

  // Handle route selection events - outside the map initialization
  const handleRouteSelect = useCallback(
    (event: CustomEvent) => {
      if (!map.current) {
        return;
      }

      const { routeId } = event.detail;

      // Find the selected route to get its name
      const selectedRoute = bikeRoutes.find((route) => route.id === routeId);

      // Show toast with route name
      if (selectedRoute) {
        showToast(selectedRoute.name);
      }

      // Update opacities for all routes and reset mountain bike trails
      updateRouteOpacity(map.current, bikeRoutes, routeId, {
        selected: 0.8,
        unselected: 0.2,
      });
      updateMtnBikeOpacity(map.current, null);

      // Fall back to defaultBounds when runtime bounds aren't available
      const bounds =
        selectedRoute?.bounds ?? toLngLatBounds(selectedRoute?.defaultBounds);

      if (bounds) {
        pauseRecenterUntil.current = Date.now() + PAUSE_FLY_MS;
        flyToBounds(map.current, bounds);
      }
    },
    [showToast],
  );

  // Handle trail selection events
  const handleTrailSelect = useCallback(
    (event: CustomEvent) => {
      if (!map.current) return;

      const { trailName, autoDetected } = event.detail;
      const trail = mountainBikeTrails.find((t) => t.trailName === trailName);

      // Manual selection during recording disables auto-detect and clears
      // any prior auto-detected trail so stop doesn't deselect the manual pick.
      if (!autoDetected && isRecordingRef.current) {
        autoDetectEnabledRef.current = false;
        autoDetectedTrailRef.current = null;
      }

      if (trail) {
        showToast(trail.displayName);
      }

      // Dim bike routes and highlight the selected trail
      updateRouteOpacity(map.current, bikeRoutes, null, {
        selected: 0.1,
        unselected: 0.1,
      });
      updateMtnBikeOpacity(map.current, trailName);

      // Calculate bounds lazily if not yet available
      if (trail && !trail.bounds) {
        trail.bounds =
          calculateTrailBounds(map.current, trailName) ?? undefined;
      }

      // Fall back to defaultBounds when runtime bounds aren't available
      // (e.g. trail tiles not loaded for the current viewport)
      const bounds = trail?.bounds ?? toLngLatBounds(trail?.defaultBounds);

      // Skip flyToBounds for auto-detected trails (map already follows user)
      if (!autoDetected && bounds) {
        pauseRecenterUntil.current = Date.now() + PAUSE_FLY_MS;
        flyToBounds(map.current, bounds);
      }
    },
    [showToast],
  );

  // Routes' resting opacity: dimmed while any marker layer is shown so the
  // markers stand out, full otherwise. Matches the layer-toggle behavior.
  const restingRouteOpacity = useCallback(
    () =>
      Object.values(markerLayersVisibleRef.current).some(Boolean)
        ? { selected: 0.1, unselected: 0.1 }
        : { selected: 1, unselected: 1 },
    [],
  );

  // Reset route opacities when routes are deselected (empty-map click,
  // sidebar trail selection, OSM trail selection, ...).
  const handleRouteDeselect = useCallback(() => {
    if (!map.current) return;
    updateRouteOpacity(map.current, bikeRoutes, null, restingRouteOpacity());
  }, [restingRouteOpacity]);

  const handleTrailDeselect = useCallback(() => {
    if (!map.current) return;
    updateMtnBikeOpacity(map.current, null);
    // Trail selection dims the bike routes — restore them on deselect.
    updateRouteOpacity(map.current, bikeRoutes, null, restingRouteOpacity());

    // Re-enable auto-detect if recording is active
    if (isRecordingRef.current) {
      autoDetectEnabledRef.current = true;
      autoDetectedTrailRef.current = null;
      detectCandidateRef.current = null;
      detectConfirmCountRef.current = 0;
    }
  }, [restingRouteOpacity]);

  // Handle area (rec area heading) selection — zoom to area bounds
  const handleAreaSelect = useCallback(
    (event: CustomEvent) => {
      if (!map.current) return;

      const { areaName } = event.detail;
      const bounds = getAreaBounds(mountainBikeTrails, areaName);

      showToast(areaName);

      // Dim bike routes, highlight trails in selected area
      updateRouteOpacity(map.current, bikeRoutes, null, {
        selected: 0.1,
        unselected: 0.1,
      });
      highlightMtnBikeArea(map.current, mountainBikeTrails, areaName);

      if (bounds) {
        pauseRecenterUntil.current = Date.now() + PAUSE_FLY_MS;
        flyToBounds(map.current, bounds);
      }
    },
    [showToast],
  );

  // Handle layer toggle events
  const handleLayerToggle = useCallback(
    async (event: CustomEvent) => {
      const { layer, visible } = event.detail;

      // Record the desired state before the map-exists guard below. These refs
      // are what style.load replays, so writing them after the bail-out made
      // that recovery unreachable for the toggles it was meant to catch.
      if (layer === 'osmTrails') osmTrailsVisibleRef.current = visible;
      if (layer === 'bikeNetwork') bikeNetworkVisibleRef.current = visible;
      if (
        layer === 'attractions' ||
        layer === 'bikeResources' ||
        layer === 'bikeRentals'
      ) {
        markerLayersVisibleRef.current[
          layer as keyof typeof markerLayersVisibleRef.current
        ] = visible;
        if (layer === 'bikeRentals') bikeRentalsVisibleRef.current = visible;
      }

      if (!map.current) {
        return;
      }

      // Nationwide OSM bike trails are an independent vector layer (not a marker
      // group), so just flip their visibility. Remember the desired state so it
      // can be replayed if the style hadn't finished loading yet.
      if (layer === 'osmTrails') {
        setOsmTrailsVisible(map.current, visible);
        return;
      }

      if (layer === 'bikeNetwork') {
        // Lazy-attach the (multi-MB) network GeoJSON on first enable rather than
        // at startup, so users who never open it don't pay the download. No
        // isStyleLoaded() gate: it reports false during any pending style
        // mutation (which would silently swallow the toggle), and the ensure/set
        // helpers are idempotent and internally guarded. The init handler also
        // replays the ref for pre-style-load toggles.
        if (bikeNetworkUrl) {
          if (visible) ensureBikeNetworkSource(map.current, bikeNetworkUrl);
          setBikeNetworkVisible(map.current, visible);
        }
        return;
      }

      // Compute route dimming from "any marker layer visible" so the result is
      // independent of the order the sidebar dispatches its OFF/ON events.
      // This runs before the bikeRentals GBFS await below on purpose: doing it
      // afterwards would deselect a route the user (or an embed's `?route=`
      // deep link) selected while that request was still in flight.
      updateRouteOpacity(map.current, bikeRoutes, null, restingRouteOpacity());
      if (visible) {
        window.dispatchEvent(new CustomEvent(MAP_EVENTS.ROUTE_DESELECT));
      }

      if (layer === 'bikeRentals') {
        if (visible) {
          bikeRentalMarkers.current.hide();

          try {
            const rentalLocations = await fetchBikeRentalLocations();

            // The user may have toggled the layer back off (or the map may have
            // unmounted) while the GBFS fetch was in flight — don't re-show.
            if (!bikeRentalsVisibleRef.current || !map.current) {
              return;
            }

            const markers = rentalLocations.map((location) =>
              createBikeRentalMarker(location),
            );

            bikeRentalMarkers.current.setMarkers(markers);
            bikeRentalMarkers.current.show(map.current);
          } catch (error) {
            console.error('Error fetching bike rental data:', error);
          }
        } else {
          bikeRentalMarkers.current.hide();
        }
      }

      if (layer === 'attractions') {
        if (visible) {
          bikeResourceMarkers.current.hide();

          if (attractionMarkers.current.length === 0) {
            const markers = mapFeatures.map((feature) =>
              createAttractionMarker(feature),
            );
            attractionMarkers.current.setMarkers(markers);
          }

          attractionMarkers.current.show(map.current);
        } else {
          attractionMarkers.current.hide();
        }
      }

      if (layer === 'bikeResources') {
        if (visible) {
          attractionMarkers.current.hide();

          if (bikeResourceMarkers.current.length === 0) {
            const markers = bikeResources.map((resource) =>
              createBikeResourceMarker(resource),
            );
            bikeResourceMarkers.current.setMarkers(markers);
          }

          bikeResourceMarkers.current.show(map.current);
        } else {
          bikeResourceMarkers.current.hide();
        }
      }
    },
    [restingRouteOpacity],
  );

  // Handler for centering on a specific location
  const handleCenterLocation = useCallback(async (event: CustomEvent) => {
    if (!map.current) {
      return;
    }

    const { location } = event.detail;

    // A bounds payload (e.g. the dockless fleet summary) fits the whole extent
    // rather than flying to a single point. maxZoom keeps a tight/one-vehicle
    // fleet from zooming all the way in.
    if (location.bounds) {
      const corners = (
        location.bounds as [[number, number], [number, number]]
      ).flat();
      // A non-finite corner (malformed feed coord) would make fitBounds throw.
      if (corners.every((n) => Number.isFinite(n))) {
        pauseRecenterUntil.current = Date.now() + PAUSE_FLY_MS;
        map.current.fitBounds(location.bounds, {
          padding: 60,
          maxZoom: 16,
          duration: 1000,
          essential: true,
        });
      }
      return;
    }

    let coordinates: [number, number] | null = null;

    // If we have latitude and longitude, use them directly
    if (location.latitude && location.longitude) {
      coordinates = [location.longitude, location.latitude];
    }
    // If we have an address, geocode it
    else if (location.address && mapboxgl.accessToken) {
      coordinates = await geocodeAddress(
        location.address,
        mapboxgl.accessToken,
      );
    }

    if (coordinates) {
      pauseRecenterUntil.current = Date.now() + PAUSE_FLY_MS;
      map.current.flyTo({
        center: coordinates,
        zoom: 17,
        essential: true,
        duration: 1000,
      });

      // Create a temporary highlight marker using React component
      const marker = createHighlightMarker(coordinates[0], coordinates[1]);

      // Only add to map if it exists
      if (map.current) {
        marker.addTo(map.current);
      }

      // Remove the highlight marker after animation
      setTimeout(() => {
        marker.remove();
      }, 3000);

      // Read marker-layer visibility from the ref, not state: the LAYER_TOGGLE
      // dispatches below run their handler synchronously, so the ref reflects
      // the just-enabled layer while this closure's state is still stale.
      const markersVisible = markerLayersVisibleRef.current;

      // Check if this location is an attraction - show the markers if they're not already shown
      const isAttraction = findLocationInArray(mapFeatures, coordinates);

      if (isAttraction && !markersVisible.attractions) {
        // Toggle attractions layer on
        window.dispatchEvent(
          new CustomEvent(MAP_EVENTS.LAYER_TOGGLE, {
            detail: { layer: 'attractions', visible: true },
          }),
        );
      }

      // Check if this location is a bike resource - show the markers if they're not already shown
      const isBikeResource = findLocationInArray(bikeResources, coordinates);

      if (isBikeResource && !markersVisible.bikeResources) {
        // Toggle bike resources layer on
        window.dispatchEvent(
          new CustomEvent(MAP_EVENTS.LAYER_TOGGLE, {
            detail: { layer: 'bikeResources', visible: true },
          }),
        );
      }

      // Check if this location is a bike rental - show the markers if they're not already shown
      const isBikeRental = bikeRentalMarkers.current.findByCoordinates(
        coordinates[0],
        coordinates[1],
      );

      if (isBikeRental && !markersVisible.bikeRentals) {
        // Toggle bike rentals layer on
        window.dispatchEvent(
          new CustomEvent(MAP_EVENTS.LAYER_TOGGLE, {
            detail: { layer: 'bikeRentals', visible: true },
          }),
        );
      }

      // Check if this is an attraction, bike resource, or bike rental and show the popup
      if (markerLayersVisibleRef.current.attractions) {
        const attractionMarker = attractionMarkers.current.findByCoordinates(
          coordinates[0],
          coordinates[1],
        );
        if (attractionMarker) {
          attractionMarkers.current.openPopupFor(attractionMarker);
        }
      }

      if (markerLayersVisibleRef.current.bikeResources) {
        const bikeMarker = bikeResourceMarkers.current.findByCoordinates(
          coordinates[0],
          coordinates[1],
        );
        if (bikeMarker) {
          bikeResourceMarkers.current.openPopupFor(bikeMarker);
        }
      }

      if (markerLayersVisibleRef.current.bikeRentals) {
        const rentalMarker = bikeRentalMarkers.current.findByCoordinates(
          coordinates[0],
          coordinates[1],
        );
        if (rentalMarker) {
          bikeRentalMarkers.current.openPopupFor(rentalMarker);
        }
      }
    }
  }, []);

  // Set up event listeners for map layers and location centering
  useEffect(() => {
    // Create stable wrapper functions that don't change between renders
    const layerToggleHandler = (e: Event) =>
      handleLayerToggle(e as CustomEvent);
    const centerLocationHandler = (e: Event) =>
      handleCenterLocation(e as CustomEvent);

    window.addEventListener(MAP_EVENTS.LAYER_TOGGLE, layerToggleHandler);
    window.addEventListener(MAP_EVENTS.CENTER_LOCATION, centerLocationHandler);

    return () => {
      window.removeEventListener(MAP_EVENTS.LAYER_TOGGLE, layerToggleHandler);
      window.removeEventListener(
        MAP_EVENTS.CENTER_LOCATION,
        centerLocationHandler,
      );
    };
  }, [handleLayerToggle, handleCenterLocation]);

  // Set up route-select event listener outside the map initialization
  useEffect(() => {
    // Create stable wrapper function that doesn't change between renders
    const routeSelectHandler = (e: Event) =>
      handleRouteSelect(e as CustomEvent);

    window.addEventListener(MAP_EVENTS.ROUTE_SELECT, routeSelectHandler);

    return () => {
      window.removeEventListener(MAP_EVENTS.ROUTE_SELECT, routeSelectHandler);
    };
  }, [handleRouteSelect]);

  // Reset route opacities whenever a route is deselected (empty-map click,
  // sidebar deselect, rides panel, ...). Without this the map kept the last
  // selection's dim/highlight forever.
  useEffect(() => {
    window.addEventListener(MAP_EVENTS.ROUTE_DESELECT, handleRouteDeselect);
    return () => {
      window.removeEventListener(
        MAP_EVENTS.ROUTE_DESELECT,
        handleRouteDeselect,
      );
    };
  }, [handleRouteDeselect]);

  // Set up trail-select and trail-deselect event listeners
  useEffect(() => {
    const trailSelectHandler = (e: Event) =>
      handleTrailSelect(e as CustomEvent);
    const trailDeselectHandler = () => handleTrailDeselect();

    window.addEventListener(MAP_EVENTS.TRAIL_SELECT, trailSelectHandler);
    window.addEventListener(MAP_EVENTS.TRAIL_DESELECT, trailDeselectHandler);

    return () => {
      window.removeEventListener(MAP_EVENTS.TRAIL_SELECT, trailSelectHandler);
      window.removeEventListener(
        MAP_EVENTS.TRAIL_DESELECT,
        trailDeselectHandler,
      );
    };
  }, [handleTrailSelect, handleTrailDeselect]);

  // Set up area-select event listener
  useEffect(() => {
    const areaSelectHandler = (e: Event) => handleAreaSelect(e as CustomEvent);

    window.addEventListener(MAP_EVENTS.AREA_SELECT, areaSelectHandler);

    return () => {
      window.removeEventListener(MAP_EVENTS.AREA_SELECT, areaSelectHandler);
    };
  }, [handleAreaSelect]);

  // Listen for toast events from other components
  useEffect(() => {
    const handler = (e: Event) => {
      const { message } = (e as CustomEvent).detail;
      showToast(message);
    };
    window.addEventListener(MAP_EVENTS.TOAST, handler);
    return () => window.removeEventListener(MAP_EVENTS.TOAST, handler);
  }, [showToast]);

  // Elevation profile hover marker
  useEffect(() => {
    let marker: mapboxgl.Marker | null = null;

    const el = document.createElement('div');
    el.style.width = '12px';
    el.style.height = '12px';
    el.style.borderRadius = '50%';
    el.style.backgroundColor = '#3b82f6';
    el.style.border = '2px solid white';
    el.style.boxShadow = '0 1px 4px rgba(0,0,0,0.4)';

    const handler = (e: Event) => {
      const { lng, lat } = (e as CustomEvent).detail;
      if (lng === null || lat === null) {
        if (marker) {
          marker.remove();
          marker = null;
        }
        return;
      }
      if (!map.current) return;
      if (!marker) {
        marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
          .setLngLat([lng, lat])
          .addTo(map.current);
      } else {
        marker.setLngLat([lng, lat]);
      }
    };

    window.addEventListener(MAP_EVENTS.ELEVATION_HOVER, handler);
    return () => {
      window.removeEventListener(MAP_EVENTS.ELEVATION_HOVER, handler);
      if (marker) marker.remove();
    };
  }, []);

  // Initialize map on component mount
  useEffect(() => {
    if (map.current) {
      return; // already initialized
    }

    // Without a token every Mapbox call throws; MapUnavailable renders instead.
    if (!hasMapboxToken) {
      return;
    }

    // Initialize map
    if (mapContainer.current) {
      const initializeMap = async () => {
        try {
          // Ensure FontAwesome is loaded
          ensureFontAwesomeLoaded();

          // Expose map for console debugging (e.g. querying tileset features)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (window as any).__map = null;
          const newMap = new mapboxgl.Map({
            container: mapContainer.current as HTMLElement,
            style: mapConfig.mapbox.styleUrl,
            center: embedOptions.center ?? mapConfig.defaultView.center,
            zoom: embedOptions.zoom ?? mapConfig.defaultView.zoom,
            pitch: mapConfig.defaultView.pitch,
            bearing: mapConfig.defaultView.bearing,
            antialias: true,
          });

          map.current = newMap;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (window as any).__map = newMap;

          // Add basic controls
          newMap.addControl(new mapboxgl.NavigationControl());

          // Registered before the load await, not after it: a token that is
          // present but revoked makes the style request fail, 'load' never
          // fires, and an error handler installed further down would never be
          // reached — the map would hang silently with a clean console.
          newMap.on('error', (event: { error?: Error }) => {
            console.error('Map error:', event.error);
          });

          // Wait for the style to load, but give up if it errors so the
          // fallback can render instead of waiting forever.
          await new Promise<void>((resolve, reject) => {
            newMap.on('load', () => resolve());
            newMap.once('error', (event: { error?: Error }) =>
              reject(event.error ?? new Error('Mapbox style failed to load')),
            );
          });

          // Find the road-label layer — route lines will be inserted
          // just below it so street names remain visible on top of routes.
          const style = newMap.getStyle();
          let firstLabelId: string | undefined;
          if (style?.layers) {
            for (const l of style.layers) {
              if (l.id === 'road-label') {
                firstLabelId = l.id;
                break;
              }
            }
          }

          hideStyleLayers(newMap, hiddenStyleLayerIds);

          // Attach curated routes whose geometry ships as GeoJSON (not Studio
          // layers) BEFORE the route styling/hit-handler blocks below, so they
          // pick up the route.id layers exactly like Studio routes.
          if (bikeRoutesUrl) {
            ensureInlineRoutes(newMap, bikeRoutesUrl, bikeRoutes);
          }

          // Set initial line width for specific layers
          if (style?.layers) {
            style.layers.forEach((layer) => {
              if (layer.type === 'line') {
                const route = bikeRoutes.find((r) => r.id === layer.id);
                if (route) {
                  newMap.setPaintProperty(
                    layer.id,
                    'line-width',
                    route.defaultWidth,
                  );
                  newMap.setPaintProperty(layer.id, 'line-color', route.color);
                  newMap.setPaintProperty(layer.id, 'line-opacity', 0.2);
                  newMap.setLayoutProperty(layer.id, 'line-cap', 'round');
                  newMap.setLayoutProperty(layer.id, 'line-join', 'round');

                  // Move route layer below road labels so street names show
                  if (firstLabelId) {
                    newMap.moveLayer(layer.id, firstLabelId);
                  }

                  // Add white casing layer beneath the route
                  const casingId = `${layer.id}-casing`;
                  if (!newMap.getLayer(casingId)) {
                    const routeLayer = layer as {
                      source?: string;
                      'source-layer'?: string;
                    };
                    newMap.addLayer(
                      {
                        id: casingId,
                        type: 'line',
                        source: routeLayer.source ?? 'composite',
                        ...(routeLayer['source-layer']
                          ? { 'source-layer': routeLayer['source-layer'] }
                          : {}),
                        layout: {
                          'line-cap': 'round',
                          'line-join': 'round',
                        },
                        paint: {
                          'line-color': '#ffffff',
                          'line-width': route.defaultWidth + 2,
                          'line-opacity': 0.3,
                        },
                        ...(layer.filter ? { filter: layer.filter } : {}),
                      },
                      layer.id, // casing goes directly below route
                    );
                  }

                  // Calculate and store route bounds
                  const bounds = calculateRouteBounds(newMap, route, layer);
                  if (bounds) {
                    route.bounds = bounds;
                  }
                }
              }
            });
          }

          // Add invisible hit-test layers and click handlers for routes.
          // The hit layer is wider than the visible route to make tapping
          // easier on phones — same pattern used for mountain bike trails.
          bikeRoutes.forEach((route) => {
            const hitId = `${route.id}-hit`;
            const routeLayer = style?.layers?.find((l) => l.id === route.id) as
              | { source?: string; 'source-layer'?: string; filter?: unknown }
              | undefined;

            if (routeLayer && !newMap.getLayer(hitId)) {
              newMap.addLayer({
                id: hitId,
                type: 'line',
                source: routeLayer.source ?? 'composite',
                ...(routeLayer['source-layer']
                  ? { 'source-layer': routeLayer['source-layer'] }
                  : {}),
                layout: { 'line-cap': 'round', 'line-join': 'round' },
                paint: {
                  'line-color': '#000000',
                  'line-width': 24,
                  'line-opacity': 0,
                },
                ...(routeLayer.filter
                  ? {
                      filter: routeLayer.filter as mapboxgl.FilterSpecification,
                    }
                  : {}),
              });
            }

            const clickTarget = newMap.getLayer(hitId) ? hitId : route.id;

            newMap.on('click', clickTarget, (e) => {
              e.preventDefault();
              // Selecting a route also clears any active trail selection, so
              // the trail highlight + elevation profile don't linger. Mirrors
              // the sidebar route-click path in MapLegend.
              window.dispatchEvent(new CustomEvent(MAP_EVENTS.TRAIL_DESELECT));
              window.dispatchEvent(
                new CustomEvent(MAP_EVENTS.ROUTE_SELECT, {
                  detail: { routeId: route.id },
                }),
              );
            });

            newMap.on('mouseenter', clickTarget, () => {
              newMap.getCanvas().style.cursor = 'pointer';
            });

            newMap.on('mouseleave', clickTarget, () => {
              newMap.getCanvas().style.cursor = '';
            });
          });

          // Fill in default bounds for any routes that couldn't be calculated at runtime
          initRouteBoundsFromDefaults(bikeRoutes);

          // Ensure all route layers are visible (some may be hidden in Mapbox Studio)
          for (const route of bikeRoutes) {
            if (newMap.getLayer(route.id)) {
              newMap.setLayoutProperty(route.id, 'visibility', 'visible');
            }
          }

          // Embed mode is Casual-only: the MTB tab is hidden, so attaching the
          // trail tilesets would cost the partner's page two extra vector
          // sources and their tile traffic on the critical path to MAP_READY,
          // and would leave trail lines clickable with no UI to show the
          // result. Skip the whole stack there.
          const showTrails = !isEmbedRef.current;

          if (showTrails) {
            // Initialize all mountain bike trail layers. The MTB tileset
            // isn't included in the Mapbox Studio style, so attach it first.
            ensureMtnBikeSource(newMap);
            initMtnBikeColors(newMap);
            initMtnBikeLayers(newMap);
          }

          // Suppress orphan trail layers baked into the Studio style (e.g. the
          // leftover TPL trails layer) so they don't render over our routes.
          hideStrayStyleLayers(newMap);

          if (showTrails) {
            // Attach the nationwide OSM bike-trails layer (hidden until toggled).
            // Its click handler is registered later, after the curated route/MTB
            // hit handlers, so curated trails win clicks in overlapping areas.
            // Replay any toggle the user flipped before the style finished loading.
            ensureOsmTrailsSource(newMap);
            if (osmTrailsVisibleRef.current) {
              setOsmTrailsVisible(newMap, true);
            }
          }

          // The classified bike-network overlay (Casual mode) is lazy-attached
          // on first toggle (its GeoJSON is multi-MB). Only replay here if the
          // user already enabled it before the style finished loading.
          if (bikeNetworkUrl && bikeNetworkVisibleRef.current) {
            ensureBikeNetworkSource(newMap, bikeNetworkUrl);
            setBikeNetworkVisible(newMap, true);
          }
          if (showTrails) {
            initTrailBoundsFromDefaults(mountainBikeTrails);

            // Apply unselected defaults (opacity/width) through the shared
            // helper so deselect and init stay in sync — see updateMtnBikeOpacity.
            updateMtnBikeOpacity(newMap, null);
          }

          for (const cfg of showTrails ? TRAIL_LAYERS : []) {
            if (!newMap.getLayer(cfg.layerId)) continue;

            // Click handler on hit-test layer for easier tapping
            const hId = `${cfg.layerId} Hit`;
            if (newMap.getLayer(hId)) {
              newMap.on('click', hId, (e) => {
                if (e.defaultPrevented) return;
                e.preventDefault();
                const rawName = e.features?.[0]?.properties?.[cfg.trailProp];
                if (!rawName) return;
                // osmId-matched layers carry an OSM_ID; resolve it to the
                // curated trail it belongs to. Name layers map via metadata.
                const trailName =
                  cfg.matchBy === 'osmId'
                    ? trailNameForOsmId(rawName)
                    : (trailMetadata[rawName]?.displayName ?? rawName);
                if (!trailName) return;
                window.dispatchEvent(
                  new CustomEvent(MAP_EVENTS.TRAIL_SELECT, {
                    detail: { trailName },
                  }),
                );
              });

              newMap.on('mouseenter', hId, () => {
                newMap.getCanvas().style.cursor = 'pointer';
              });

              newMap.on('mouseleave', hId, () => {
                newMap.getCanvas().style.cursor = '';
              });
            }
          }

          // Register the OSM trail click handler AFTER the curated route + MTB
          // hit handlers above. Mapbox fires delegated layer handlers in
          // registration order, so where an OSM way overlaps a curated trail the
          // curated handler runs first and preventDefault()s; the OSM handler
          // then bails on the already-handled click. Clear any prior registration
          // first in case the style reloads and re-runs this block.
          osmSelectionCleanup.current?.();
          if (showTrails) {
            osmSelectionCleanup.current = registerOsmTrailSelection(newMap);
          }

          // Click on empty map area deselects routes and trails.
          // Check originalEvent.target to ignore ghost clicks that land on
          // the canvas after an overlay (e.g. elevation panel) is removed
          // mid-tap on mobile.
          newMap.on('click', (e) => {
            if (e.defaultPrevented) return; // a route/trail layer handled it
            const target = e.originalEvent.target as HTMLElement;
            if (!newMap.getCanvas().contains(target)) return;
            window.dispatchEvent(new CustomEvent(MAP_EVENTS.ROUTE_DESELECT));
            window.dispatchEvent(new CustomEvent(MAP_EVENTS.TRAIL_DESELECT));
          });

          // Tapping the Mapbox north-arrow compass button should exit
          // compass (heading-up) mode so the bearing stays north.
          const compassBtn = newMap
            .getContainer()
            .querySelector('.mapboxgl-ctrl-compass');
          if (compassBtn) {
            compassBtn.addEventListener('click', () => {
              if (compassCleanup.current) {
                compassCleanup.current();
                compassCleanup.current = null;
              }
              compassHeading.current = null;
              setCompassMode(false);
            });
          }

          // Force a resize to ensure proper display
          setTimeout(() => {
            if (map.current) {
              map.current.resize();
            }
          }, 100);

          // Do NOT start the GPS watch here — it begins only when the user
          // enables tracking or starts recording (see setLocationWatch).
          initializeGestureWatch();

          // Debug: click map to simulate GPS location
          if (mapConfig.debug.simulateLocation) {
            newMap.on('click', (e) => {
              window.dispatchEvent(
                new CustomEvent(MAP_EVENTS.LOCATION_UPDATE, {
                  detail: { lng: e.lngLat.lng, lat: e.lngLat.lat },
                }),
              );
            });
          }

          // Clear existing marker managers before initialization
          attractionMarkers.current.clear();
          bikeResourceMarkers.current.clear();
          bikeRentalMarkers.current.clear();

          // Pre-create attraction markers (they will be added to map only when toggled on)
          const attractionMarkerList = mapFeatures.map((feature) =>
            createAttractionMarker(feature),
          );
          attractionMarkers.current.setMarkers(attractionMarkerList);

          // Pre-create bike resource markers
          const bikeResourceMarkerList = bikeResources.map((resource) =>
            createBikeResourceMarker(resource),
          );
          bikeResourceMarkers.current.setMarkers(bikeResourceMarkerList);

          // Update accuracy circle on zoom — synchronous so circle resizes in
          // the same frame as the map (RAF batching caused a 1-frame lag)
          newMap.on('zoom', () => {
            if (locationMarker.current && locationAccuracy.current > 0) {
              updateAccuracyCircle(
                locationMarker.current,
                locationAccuracy.current,
                newMap.getZoom(),
              );
            }
          });

          // Signal that the map is fully initialized and ready for events.
          // Sets a flag first so late listeners (which registered after this
          // fires) can detect they missed the event — see utils/map-ready.
          // A teardown may have run while this async init was mid-flight
          // (Strict Mode's double-mount, Fast Refresh). Signalling ready then
          // would fire onMapReady consumers at a map that no longer exists.
          if (map.current !== newMap) return;
          setMapReady();
        } catch (error) {
          console.error('Error initializing map:', error);
          setMapFailed(true);
        }
      };

      initializeMap();
    }

    // Capture refs for cleanup
    const attractionMarkersRef = attractionMarkers.current;
    const bikeResourceMarkersRef = bikeResourceMarkers.current;
    const bikeRentalMarkersRef = bikeRentalMarkers.current;

    // Cleanup event listener
    return () => {
      if (watchId.current !== null) {
        navigator.geolocation.clearWatch(watchId.current);
      }

      if (locationWatch.current) {
        clearInterval(locationWatch.current);
        locationWatch.current = undefined;
      }

      // Clean up all markers before removing the map
      if (locationMarker.current) {
        locationMarker.current.remove();
      }

      attractionMarkersRef.clear();
      bikeResourceMarkersRef.clear();
      bikeRentalMarkersRef.clear();

      // Drop the OSM selection's window listeners before the map goes away.
      if (osmSelectionCleanup.current) {
        osmSelectionCleanup.current();
        osmSelectionCleanup.current = null;
      }

      // A first-fix listener may still be pending if tracking was enabled but
      // GPS never fired — remove it so it can't fly a torn-down map.
      if (pendingLocationListener.current) {
        window.removeEventListener(
          MAP_EVENTS.LOCATION_UPDATE,
          pendingLocationListener.current,
        );
        pendingLocationListener.current = null;
      }

      if (map.current) {
        map.current.remove();
        map.current = null;
      }

      // The flag describes this map instance. Leaving it set would make
      // listeners on a remounted tree (Strict Mode, Fast Refresh) dispatch
      // immediately against a map that no longer exists, skipping the
      // MAP_READY listener that would have recovered them.
      clearMapReady();
    };
    // embedOptions is read only for its value at mount time (the initial
    // center/zoom); this effect must still only run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array - only run once on mount

  const setLocationWatch = (value: boolean) => {
    setWatchingLocation(value);

    if (value) {
      // Start the GPS watch on first explicit opt-in (idempotent — no-op if
      // a watch is already running, e.g. when recording is also active).
      initializeLocationMarker();

      // When enabled: immediately center on current location (preserving zoom).
      // If GPS hasn't fired yet (locationMarker null), wait for the first
      // LOCATION_UPDATE and then fly there — fixes iOS cold-start delay.
      if (map.current && locationMarker.current) {
        const lngLat = locationMarker.current.getLngLat();
        map.current.flyTo({
          center: [lngLat.lng, lngLat.lat],
          essential: true,
          duration: 1000,
        });
      } else if (map.current) {
        const onFirstLocation = (e: Event) => {
          pendingLocationListener.current = null;
          const { lng, lat } = (e as CustomEvent).detail;
          map.current?.flyTo({
            center: [lng, lat],
            essential: true,
            duration: 1000,
          });
        };
        pendingLocationListener.current = onFirstLocation;
        window.addEventListener(MAP_EVENTS.LOCATION_UPDATE, onFirstLocation, {
          once: true,
        });

        // Ask for a cached/coarse fix so the dot paints on tap instead of
        // waiting for the watchPosition (maximumAge: 0) to acquire a fresh
        // high-accuracy fix on iOS cold start. The existing watchPosition
        // callback handles marker creation and accuracy circle updates.
        navigator.geolocation.getCurrentPosition(
          (position) => {
            if (!map.current || locationMarker.current) return;
            locationMarker.current = createLocationMarker(
              position.coords.longitude,
              position.coords.latitude,
            );
            locationMarker.current.addTo(map.current);
            locationAccuracy.current = position.coords.accuracy;
            updateAccuracyCircle(
              locationMarker.current,
              position.coords.accuracy,
              map.current.getZoom(),
            );
            window.dispatchEvent(
              new CustomEvent(MAP_EVENTS.LOCATION_UPDATE, {
                detail: {
                  lng: position.coords.longitude,
                  lat: position.coords.latitude,
                },
              }),
            );
          },
          () => {},
          { enableHighAccuracy: false, maximumAge: 60_000, timeout: 5_000 },
        );
      }

      // Continuously re-center on current position using jumpTo (no animation)
      // so the map is never mid-flight, which would block route-layer tap events.
      // Skip when the user is mid-gesture (pinch-zoom, drag) so we don't
      // interrupt and snap the zoom back — this was causing #57.
      // Clear any prior interval first so re-enabling can't leak a duplicate.
      if (locationWatch.current) {
        clearInterval(locationWatch.current);
      }
      locationWatch.current = setInterval(() => {
        if (!map.current || !locationMarker.current) {
          return;
        }
        if (map.current.isMoving() || map.current.isZooming()) {
          return;
        }
        // Skip re-centering during cooldown after programmatic fly-to
        if (Date.now() < pauseRecenterUntil.current) {
          return;
        }

        const lngLat = locationMarker.current.getLngLat();
        const jumpOpts: mapboxgl.CameraOptions = {
          center: [lngLat.lng, lngLat.lat],
        };
        // In compass mode, rotate the map to match device heading
        if (compassHeading.current !== null) {
          jumpOpts.bearing = compassHeading.current;
        }
        map.current.jumpTo(jumpOpts);
      }, 1000);
    } else {
      // When disabled: stop tracking and compass
      if (locationWatch.current) {
        clearInterval(locationWatch.current);
        locationWatch.current = undefined;
      }
      // Cancel pending GPS-first-fix listener so it doesn't flyTo after disable
      if (pendingLocationListener.current) {
        window.removeEventListener(
          MAP_EVENTS.LOCATION_UPDATE,
          pendingLocationListener.current,
        );
        pendingLocationListener.current = null;
      }
      if (compassCleanup.current) {
        compassCleanup.current();
        compassCleanup.current = null;
      }
      compassHeading.current = null;
      setCompassMode(false);
      // Reset bearing to default
      if (map.current) {
        map.current.easeTo({
          bearing: mapConfig.defaultView.bearing,
          duration: 500,
        });
      }
    }
  };

  // Attach compass (device orientation) listener to rotate the map bearing.
  // Smoothing logic lives in HeadingSmoother (src/utils/compass.ts).
  const attachCompassListener = () => {
    const smoother = new HeadingSmoother();

    const handler = (e: DeviceOrientationEvent) => {
      // Extract raw magnetometer heading
      const evt = e as DeviceOrientationEvent & {
        webkitCompassHeading?: number;
      };
      let raw: number | null = null;
      if (typeof evt.webkitCompassHeading === 'number') {
        raw = evt.webkitCompassHeading;
      } else if (typeof e.alpha === 'number') {
        raw = (360 - e.alpha) % 360;
      }

      const smoothed = smoother.update(raw, gpsHeading.current);
      if (smoothed === null) return;

      // Only update map when the heading changes enough
      const prev = compassHeading.current;
      if (prev !== null) {
        let diff = Math.abs(smoothed - prev);
        if (diff > 180) diff = 360 - diff;
        if (diff < 1) return;
      }

      compassHeading.current = smoothed;
      if (map.current) {
        map.current.easeTo({
          bearing: smoothed,
          duration: 50,
          easing: (t) => t,
        });
      }
    };

    // Listen to both event types when available.
    const events: string[] = [];
    if ('ondeviceorientationabsolute' in window) {
      events.push('deviceorientationabsolute');
    }
    events.push('deviceorientation');

    for (const evt of events) {
      window.addEventListener(evt, handler as EventListener);
    }
    compassCleanup.current = () => {
      for (const evt of events) {
        window.removeEventListener(evt, handler as EventListener);
      }
    };
    setCompassMode(true);
  };

  // Toggle location tracking: off → tracking (north-up) → compass (heading-up) → off.
  // The permission request for iOS is done inline (not in a nested async) so it
  // stays within the user-gesture context that Safari requires.
  const toggleWatchLocation = async () => {
    if (!watchingLocation) {
      // off → tracking
      setLocationWatch(true);
    } else if (!compassMode) {
      // tracking → compass: request permission (iOS), then attach listener
      const DOE = DeviceOrientationEvent as unknown as {
        requestPermission?: () => Promise<string>;
      };
      if (DOE.requestPermission) {
        try {
          const permission = await DOE.requestPermission();
          if (permission !== 'granted') {
            setLocationWatch(false);
            return;
          }
        } catch {
          setLocationWatch(false);
          return;
        }
      }
      attachCompassListener();
    } else {
      // compass → off
      setLocationWatch(false);
    }
  };

  // Reset trail detection state when returning from background so detection
  // starts fresh instead of requiring stale confirmation counts
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      if (!autoDetectEnabledRef.current) return;

      detectCandidateRef.current = null;
      detectConfirmCountRef.current = 0;
      lastDetectTimeRef.current = 0;
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () =>
      document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  // Enable location tracking when recording starts, disable when it stops
  // Also toggle CSS class on map container for Mapbox control positioning
  useEffect(() => {
    const handleStart = () => {
      setRecordingActive(true);
      setLocationWatch(true);
      mapContainer.current?.classList.add('recording-active');
      // Enable trail auto-detection
      isRecordingRef.current = true;
      autoDetectEnabledRef.current = true;
      autoDetectedTrailRef.current = null;
      detectCandidateRef.current = null;
      detectConfirmCountRef.current = 0;
      lastDetectTimeRef.current = 0;
    };
    const handleStop = () => {
      setRecordingActive(false);
      setLocationWatch(false);
      mapContainer.current?.classList.remove('recording-active');
      // Clean up auto-detected trail selection
      isRecordingRef.current = false;
      if (autoDetectedTrailRef.current !== null) {
        window.dispatchEvent(new CustomEvent(MAP_EVENTS.TRAIL_DESELECT));
      }
      autoDetectEnabledRef.current = false;
      autoDetectedTrailRef.current = null;
      detectCandidateRef.current = null;
      detectConfirmCountRef.current = 0;
    };

    window.addEventListener(MAP_EVENTS.RIDE_RECORDING_START, handleStart);
    window.addEventListener(MAP_EVENTS.RIDE_RECORDING_STOP, handleStop);
    return () => {
      window.removeEventListener(MAP_EVENTS.RIDE_RECORDING_START, handleStart);
      window.removeEventListener(MAP_EVENTS.RIDE_RECORDING_STOP, handleStop);
    };
    // setLocationWatch is stable-by-refs (reads only refs + stable setters) and
    // this listener wiring must run exactly once; the real fix is the deferred
    // GPS/compass hook extraction.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div ref={mapContainer} className="w-full h-full absolute inset-0" />

      {(!hasMapboxToken || mapFailed) && <MapUnavailable />}

      <EmbedAttribution />

      {/* Route selection toast */}
      {toastMessage && (
        <div
          className={cn(
            'absolute left-1/2 -translate-x-1/2 bg-black/65 text-white px-6 py-3 rounded-lg text-base font-medium z-[800] shadow-[0_4px_12px_rgba(0,0,0,0.3)] pointer-events-none animate-toast-fade-in top-[calc(1.25rem+env(safe-area-inset-top))]',
            toastFadingOut && 'animate-toast-fade-out',
          )}
        >
          {toastMessage}
        </div>
      )}

      <ElevationProfile />

      {/* Location tracking toggle */}
      {mapConfig.debug.showLocationTracker && (
        <div
          onClick={toggleWatchLocation}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              toggleWatchLocation();
            }
          }}
          role="button"
          tabIndex={0}
          className={cn(
            'fixed bottom-[60px] right-4 w-10 h-10 rounded-full cursor-pointer z-[501] shadow-[0_2px_4px_rgba(0,0,0,0.2)] text-white flex items-center justify-center bg-white transition-colors duration-200 [&_svg]:w-5 active:bg-[#e5e5e5]',
            watchingLocation &&
              !compassMode &&
              'bg-[rgb(165,240,255)] active:bg-[rgb(145,220,235)]',
            compassMode && 'bg-[rgb(100,200,255)] active:bg-[rgb(80,180,235)]',
          )}
        >
          {compassMode ? (
            /* Compass icon for heading-up mode */
            <svg
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
              role="img"
              fill="none"
              stroke="#000000"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <polygon
                points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"
                fill="#000000"
              />
            </svg>
          ) : (
            /* Navigation arrow for center/off mode */
            <svg
              viewBox="0 0 100 100"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
              role="img"
              preserveAspectRatio="xMidYMid meet"
              fill="#000000"
            >
              <g>
                <path
                  d="M87.13 0a2.386 2.386 0 0 0-.64.088a2.386 2.386 0 0 0-.883.463L11.34 62.373a2.386 2.386 0 0 0 1.619 4.219l37.959-1.479l17.697 33.614a2.386 2.386 0 0 0 4.465-.707L89.486 2.79A2.386 2.386 0 0 0 87.131 0z"
                  fill="#000000"
                />
              </g>
            </svg>
          )}
        </div>
      )}
    </>
  );
});

// Shown in place of the map when no Mapbox token was compiled in. Without it a
// misconfigured deploy is a silent blank rectangle — which on a partner's page
// looks like our embed is simply broken, with the only clue in their console.
function MapUnavailable() {
  return (
    <div className="absolute inset-0 z-[600] flex items-center justify-center bg-gray-100 p-6">
      <div className="max-w-sm text-center">
        <FontAwesomeIcon
          icon={faTriangleExclamation}
          className="w-8 h-8 text-gray-400"
        />
        <p className="mt-3 text-sm font-medium text-gray-800">
          Map unavailable
        </p>
        <p className="mt-1 text-sm text-gray-600">
          This site is missing its Mapbox access token, so the map could not be
          loaded.
        </p>
      </div>
    </div>
  );
}

// Main Map component - manages layout and UI chrome
export default function BikeMap() {
  const { isEmbed } = useEmbed();
  return (
    <MapLegendProvider>
      <div className="w-screen h-full relative overflow-visible">
        <MapboxMap />
        {/* Ride recording needs geolocation + persistent storage — not for embeds */}
        {!isEmbed && <RidesPanel />}
      </div>
    </MapLegendProvider>
  );
}

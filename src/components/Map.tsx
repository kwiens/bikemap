'use client';

import { useEffect, useRef, useState, memo, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import { MapLegendProvider } from '@/components/MapLegend';
import { RidesPanel } from '@/components/RidesPanel';
import {
  bikeRoutes,
  mapFeatures,
  bikeResources,
  mountainBikeTrails,
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
import {
  fetchStationInformation,
  fetchStationStatus,
  gbfsToBikeRentalLocation,
  type GBFSStationStatus,
} from '@/data/gbfs';
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
  TRAIL_LAYERS,
  addRideLayer,
  updateRideLayer,
  removeRideLayer,
  detectTrailAtPoint,
  toLngLatBounds,
} from '@/utils/map';
import { loadRide } from '@/utils/ride-storage';
import { mapConfig } from '@/config/map.config';
import { MAP_EVENTS } from '@/events';
import { TRAIL_METADATA } from '@/data/trail-metadata';
import { HeadingSmoother } from '@/utils/compass';

// Initialize Mapbox access token from config
mapboxgl.accessToken = mapConfig.mapbox.accessToken;

// MapboxMap component - isolated from UI state changes
const MapboxMap = memo(function MapboxMap() {
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
  // GPS heading/speed for velocity-aware compass smoothing
  const gpsHeading = useRef<{ heading: number; speed: number } | null>(null);
  const pendingLocationListener = useRef<((e: Event) => void) | null>(null);
  const [recordingActive, setRecordingActive] = useState(false);

  // Track markers for attractions and bike resources
  const attractionMarkers = useRef<MarkerManager>(new MarkerManager());
  const bikeResourceMarkers = useRef<MarkerManager>(new MarkerManager());
  const bikeRentalMarkers = useRef<MarkerManager>(new MarkerManager());
  const [showAttractions, setShowAttractions] = useState(false);
  const [showBikeResources, setShowBikeResources] = useState(false);
  const [showBikeRentals, setShowBikeRentals] = useState(false);

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

    const coords: [number, number][] = ride.points.map((p) => [p.lng, p.lat]);
    addRideLayer(map.current, coords);

    // Dim other routes/trails
    updateRouteOpacity(map.current, bikeRoutes, null, {
      selected: 0.1,
      unselected: 0.1,
    });
    updateMtnBikeOpacity(map.current, null);

    // Fly to ride bounds
    const [swLng, swLat, neLng, neLat] = ride.bounds;
    const bounds = new mapboxgl.LngLatBounds([swLng, swLat], [neLng, neLat]);
    pauseRecenterUntil.current = Date.now() + 5000;
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
    const liveCoords: [number, number][] = [];
    let updateSkip = 0;
    const DETECT_INTERVAL_MS = 3000;
    const DETECT_CONFIRM_COUNT = 3; // ~9s before first auto-select
    const DETECT_SWITCH_COUNT = 5; // ~15s before switching or clearing

    const updateHandler = (e: Event) => {
      if (!map.current) return;
      const detail = (e as CustomEvent).detail;

      // Batch restore (continueRide) — push all points and render once
      if (detail.points) {
        liveCoords.push(...(detail.points as [number, number][]));
        updateRideLayer(map.current, liveCoords);
        return;
      }

      const { point } = detail;
      liveCoords.push(point);
      // Throttle Mapbox setData to every 3rd point
      updateSkip++;
      if (liveCoords.length >= 2 && updateSkip >= 3) {
        updateRideLayer(map.current, liveCoords);
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
      liveCoords.length = 0;
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
      () => {
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
        pauseRecenterUntil.current = Date.now() + 5000;
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
        pauseRecenterUntil.current = Date.now() + 5000;
        flyToBounds(map.current, bounds);
      }
    },
    [showToast],
  );

  const handleTrailDeselect = useCallback(() => {
    if (!map.current) return;
    updateMtnBikeOpacity(map.current, null);

    // Re-enable auto-detect if recording is active
    if (isRecordingRef.current) {
      autoDetectEnabledRef.current = true;
      autoDetectedTrailRef.current = null;
      detectCandidateRef.current = null;
      detectConfirmCountRef.current = 0;
    }
  }, []);

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
        pauseRecenterUntil.current = Date.now() + 5000;
        flyToBounds(map.current, bounds);
      }
    },
    [showToast],
  );

  // Handle layer toggle events
  const handleLayerToggle = useCallback(async (event: CustomEvent) => {
    const { layer, visible } = event.detail;

    if (!map.current) {
      return;
    }

    if (layer === 'bikeRentals') {
      setShowBikeRentals(visible);

      if (visible) {
        bikeRentalMarkers.current.hide();

        try {
          // Fetch station information and status
          const [stations, statuses] = await Promise.all([
            fetchStationInformation(),
            fetchStationStatus(),
          ]);

          // Create status map
          const statusMap: { [key: string]: GBFSStationStatus } = {};
          statuses.forEach((status) => {
            statusMap[status.station_id] = status;
          });

          // Convert GBFS stations to our format and create markers
          const rentalLocations = stations.map((station) =>
            gbfsToBikeRentalLocation(station, statusMap[station.station_id]),
          );

          // Create markers using the utility function
          const markers = rentalLocations
            .map((location) => createBikeRentalMarker(location))
            .filter((marker): marker is mapboxgl.Marker => marker !== null);

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
      setShowAttractions(visible);

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
      setShowBikeResources(visible);

      if (visible) {
        bikeResourceMarkers.current.hide();

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

    if (visible) {
      updateRouteOpacity(map.current, bikeRoutes, null, {
        selected: 0.1,
        unselected: 0.1,
      });
      window.dispatchEvent(new CustomEvent(MAP_EVENTS.ROUTE_DESELECT));
    } else {
      updateRouteOpacity(map.current, bikeRoutes, null, {
        selected: 1,
        unselected: 1,
      });
    }
  }, []);

  // Handler for centering on a specific location
  const handleCenterLocation = useCallback(
    async (event: CustomEvent) => {
      if (!map.current) {
        return;
      }

      const { location } = event.detail;

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
        // Fly to the location
        pauseRecenterUntil.current = Date.now() + 5000;
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

        // Check if this location is an attraction - show the markers if they're not already shown
        const isAttraction = findLocationInArray(mapFeatures, coordinates);

        if (isAttraction && !showAttractions) {
          // Toggle attractions layer on
          window.dispatchEvent(
            new CustomEvent(MAP_EVENTS.LAYER_TOGGLE, {
              detail: { layer: 'attractions', visible: true },
            }),
          );
        }

        // Check if this location is a bike resource - show the markers if they're not already shown
        const isBikeResource = findLocationInArray(bikeResources, coordinates);

        if (isBikeResource && !showBikeResources) {
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

        if (isBikeRental && !showBikeRentals) {
          // Toggle bike rentals layer on
          window.dispatchEvent(
            new CustomEvent(MAP_EVENTS.LAYER_TOGGLE, {
              detail: { layer: 'bikeRentals', visible: true },
            }),
          );
        }

        // Check if this is an attraction, bike resource, or bike rental and show the popup
        if (showAttractions) {
          const attractionMarker = attractionMarkers.current.findByCoordinates(
            coordinates[0],
            coordinates[1],
          );
          if (attractionMarker) {
            attractionMarkers.current.openPopupFor(attractionMarker);
          }
        }

        if (showBikeResources) {
          const bikeMarker = bikeResourceMarkers.current.findByCoordinates(
            coordinates[0],
            coordinates[1],
          );
          if (bikeMarker) {
            bikeResourceMarkers.current.openPopupFor(bikeMarker);
          }
        }

        if (showBikeRentals) {
          const rentalMarker = bikeRentalMarkers.current.findByCoordinates(
            coordinates[0],
            coordinates[1],
          );
          if (rentalMarker) {
            bikeRentalMarkers.current.openPopupFor(rentalMarker);
          }
        }
      }
    },
    [showAttractions, showBikeResources, showBikeRentals],
  );

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
            center: mapConfig.defaultView.center,
            zoom: mapConfig.defaultView.zoom,
            pitch: mapConfig.defaultView.pitch,
            bearing: mapConfig.defaultView.bearing,
            antialias: true,
          });

          map.current = newMap;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (window as any).__map = newMap;

          // Add basic controls
          newMap.addControl(new mapboxgl.NavigationControl());

          // Wait for map to load
          await new Promise<void>((resolve) => {
            newMap.on('load', () => {
              resolve();
            });
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

          // Initialize all mountain bike trail layers
          initMtnBikeColors(newMap);
          initMtnBikeLayers(newMap);
          initTrailBoundsFromDefaults(mountainBikeTrails);

          for (const cfg of TRAIL_LAYERS) {
            if (!newMap.getLayer(cfg.layerId)) continue;

            newMap.setPaintProperty(cfg.layerId, 'line-opacity', 0.35);
            newMap.setPaintProperty(cfg.layerId, 'line-width', 3);

            // Click handler on hit-test layer for easier tapping
            const hId = `${cfg.layerId} Hit`;
            if (newMap.getLayer(hId)) {
              newMap.on('click', hId, (e) => {
                e.preventDefault();
                const rawName = e.features?.[0]?.properties?.[cfg.trailProp];
                if (!rawName) return;
                const meta = TRAIL_METADATA[rawName];
                const trailName = meta?.displayName ?? rawName;
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

          initializeLocationMarker();

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

          // Add error handler
          newMap.on('error', (event: { error: Error }) => {
            console.error('Map error:', event.error);
          });

          // Signal that the map is fully initialized and ready for events.
          // Set a flag first so late listeners (e.g. page.tsx useEffect that
          // registers after this fires) can detect they missed the event.
          (window as unknown as Record<string, boolean>).__mapReady = true;
          window.dispatchEvent(new Event(MAP_EVENTS.MAP_READY));
        } catch (error) {
          console.error('Error initializing map:', error);
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

      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, []); // Empty dependency array - only run once on mount

  const setLocationWatch = (value: boolean) => {
    setWatchingLocation(value);

    if (value) {
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
      }

      // Continuously re-center on current position using jumpTo (no animation)
      // so the map is never mid-flight, which would block route-layer tap events.
      // Skip when the user is mid-gesture (pinch-zoom, drag) so we don't
      // interrupt and snap the zoom back — this was causing #57.
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
  }, []);

  return (
    <>
      <div ref={mapContainer} className="w-full h-full absolute inset-0" />

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

// Main Map component - manages layout and UI chrome
export default function BikeMap() {
  return (
    <MapLegendProvider>
      <div className="w-screen h-full relative overflow-visible">
        <MapboxMap />
        <RidesPanel />
      </div>
    </MapLegendProvider>
  );
}

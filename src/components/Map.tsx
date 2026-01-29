'use client';

import { useEffect, useRef, useState, memo, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import '@/app/map.css';
import { MapLegendProvider } from '@/components/MapLegend';
import { bikeRoutes, mapFeatures, bikeResources } from '@/data/geo_data';
import {
  createLocationMarker,
  createAttractionMarker,
  createBikeResourceMarker,
  createBikeRentalMarker,
  createHighlightMarker,
  ensureFontAwesomeLoaded,
  MarkerManager,
} from '@/components/MapMarkers';
import { useToast, useMapResize } from '@/hooks';
import {
  fetchStationInformation,
  fetchStationStatus,
  gbfsToBikeRentalLocation,
  type GBFSStationStatus,
} from '@/data/gbfs';
import {
  geocodeAddress,
  updateRouteOpacity,
  calculateZoomForBounds,
  calculateRouteBounds,
  findLocationInArray,
} from '@/utils/map';
import { mapConfig } from '@/config/map.config';

// Initialize Mapbox access token from config
mapboxgl.accessToken = mapConfig.mapbox.accessToken;

// MapboxMap component - isolated from UI state changes
const MapboxMap = memo(function MapboxMap() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const locationMarker = useRef<mapboxgl.Marker | null>(null);
  const watchId = useRef<number | null>(null);
  const locationWatch = useRef<NodeJS.Timeout | undefined>(undefined);
  const [watchingLocation, setWatchingLocation] = useState(false);

  // Track markers for attractions and bike resources
  const attractionMarkers = useRef<MarkerManager>(new MarkerManager());
  const bikeResourceMarkers = useRef<MarkerManager>(new MarkerManager());
  const bikeRentalMarkers = useRef<MarkerManager>(new MarkerManager());
  const [showAttractions, setShowAttractions] = useState(false);
  const [showBikeResources, setShowBikeResources] = useState(false);
  const [showBikeRentals, setShowBikeRentals] = useState(false);

  // Use custom hooks
  const {
    message: toastMessage,
    isFadingOut: toastFadingOut,
    showToast,
  } = useToast();
  useMapResize({ map });

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
      },
      () => {
        //console.log(positionError);
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

  function initializeGestureWatch() {
    if (!map.current) {
      return;
    }

    // When user interacts with map, disable location tracking
    const disableTracking = () => {
      setWatchingLocation(false);
      if (locationWatch.current) {
        clearInterval(locationWatch.current);
        locationWatch.current = undefined;
      }
    };

    map.current.on('click', disableTracking);
    map.current.on('touch', disableTracking);
    map.current.on('touchend', disableTracking);
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

      // Update opacities for all routes
      updateRouteOpacity(map.current, bikeRoutes, routeId, {
        selected: 0.8,
        unselected: 0.2,
      });

      if (selectedRoute?.bounds) {
        const bounds = selectedRoute.bounds;

        try {
          // Calculate the center of the bounds
          const centerLng = (bounds.getWest() + bounds.getEast()) / 2;
          const centerLat = (bounds.getNorth() + bounds.getSouth()) / 2;

          // Calculate zoom level based on bounds and device type
          const isMobile = window.innerWidth <= 768;
          const zoom = calculateZoomForBounds(bounds, isMobile);

          // Use flyTo which tends to be more reliable
          map.current.flyTo({
            center: [centerLng, centerLat],
            zoom: zoom,
            essential: true,
            duration: 1000,
          });

          // Force a resize to ensure the map is rendered properly
          setTimeout(() => {
            if (map.current) {
              map.current.resize();
            }
          }, 100);
        } catch (error) {
          console.error('Error flying to route:', error);
        }
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

    // Reset route opacity and dispatch event when any layer is toggled on
    if (visible) {
      updateRouteOpacity(map.current, bikeRoutes, null, {
        selected: 0.1,
        unselected: 0.1,
      });

      // Dispatch event to notify the MapLegend component
      window.dispatchEvent(new CustomEvent('route-deselect'));
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
            new CustomEvent('layer-toggle', {
              detail: { layer: 'attractions', visible: true },
            }),
          );
        }

        // Check if this location is a bike resource - show the markers if they're not already shown
        const isBikeResource = findLocationInArray(bikeResources, coordinates);

        if (isBikeResource && !showBikeResources) {
          // Toggle bike resources layer on
          window.dispatchEvent(
            new CustomEvent('layer-toggle', {
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
            new CustomEvent('layer-toggle', {
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
            attractionMarker.togglePopup();
          }
        }

        if (showBikeResources) {
          const bikeMarker = bikeResourceMarkers.current.findByCoordinates(
            coordinates[0],
            coordinates[1],
          );
          if (bikeMarker) {
            bikeMarker.togglePopup();
          }
        }

        if (showBikeRentals) {
          const rentalMarker = bikeRentalMarkers.current.findByCoordinates(
            coordinates[0],
            coordinates[1],
          );
          if (rentalMarker) {
            rentalMarker.togglePopup();
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

    window.addEventListener('layer-toggle', layerToggleHandler);
    window.addEventListener('center-location', centerLocationHandler);

    return () => {
      window.removeEventListener('layer-toggle', layerToggleHandler);
      window.removeEventListener('center-location', centerLocationHandler);
    };
  }, [handleLayerToggle, handleCenterLocation]);

  // Set up route-select event listener outside the map initialization
  useEffect(() => {
    // Create stable wrapper function that doesn't change between renders
    const routeSelectHandler = (e: Event) =>
      handleRouteSelect(e as CustomEvent);

    window.addEventListener('route-select', routeSelectHandler);

    return () => {
      window.removeEventListener('route-select', routeSelectHandler);
    };
  }, [handleRouteSelect]);

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

          // Add basic controls
          newMap.addControl(new mapboxgl.NavigationControl());

          // Wait for map to load
          await new Promise<void>((resolve) => {
            newMap.on('load', () => {
              // Log all available layers
              const style = newMap.getStyle();
              if (style?.layers) {
                console.log('Available Map Layers:', style.layers);
              }
              resolve();
            });
          });

          // Set initial line width for specific layers
          const style = newMap.getStyle();
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
                  newMap.setPaintProperty(layer.id, 'line-opacity', 0.2); // Start with low opacity

                  // Calculate and store route bounds
                  const bounds = calculateRouteBounds(newMap, route, layer);
                  if (bounds) {
                    route.bounds = bounds;
                  }
                }
              }
            });
          }

          // Add click handlers to route layers
          bikeRoutes.forEach((route) => {
            // Make route layer clickable
            newMap.on('click', route.id, (e) => {
              // Prevent default map click behavior
              e.preventDefault();

              // Dispatch route-select event (same as clicking in legend)
              window.dispatchEvent(
                new CustomEvent('route-select', {
                  detail: { routeId: route.id },
                }),
              );
            });

            // Change cursor to pointer when hovering over route
            newMap.on('mouseenter', route.id, () => {
              newMap.getCanvas().style.cursor = 'pointer';
            });

            // Change cursor back when leaving route
            newMap.on('mouseleave', route.id, () => {
              newMap.getCanvas().style.cursor = '';
            });
          });

          // Force a resize to ensure proper display
          setTimeout(() => {
            if (map.current) {
              map.current.resize();
            }
          }, 100);

          initializeLocationMarker();
          initializeGestureWatch();

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

          // Add error handler
          newMap.on('error', (event: { error: Error }) => {
            console.error('Map error:', event.error);
          });
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
      // When enabled: immediately center on current location (preserving zoom)
      if (map.current && locationMarker.current) {
        const lngLat = locationMarker.current.getLngLat();
        map.current.flyTo({
          center: [lngLat.lng, lngLat.lat],
          essential: true,
          duration: 1000,
        });
      }

      // Then continuously track position (preserving zoom)
      locationWatch.current = setInterval(() => {
        if (!map.current || !locationMarker.current) {
          return;
        }

        const lngLat = locationMarker.current.getLngLat();
        map.current.flyTo({
          center: [lngLat.lng, lngLat.lat],
          essential: true,
          duration: 1000,
        });
      }, 500);
    } else {
      // When disabled: stop tracking
      if (locationWatch.current) {
        clearInterval(locationWatch.current);
        locationWatch.current = undefined;
      }
    }
  };

  // Toggle location tracking
  const toggleWatchLocation = () => {
    setLocationWatch(!watchingLocation);
  };

  return (
    <>
      <div ref={mapContainer} className="map-container" />

      {/* Route selection toast */}
      {toastMessage && (
        <div className={`route-toast ${toastFadingOut ? 'fade-out' : ''}`}>
          {toastMessage}
        </div>
      )}

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
          className={`location-watch-toggle ${watchingLocation ? 'active' : 'inactive'}`}
        >
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
              ></path>
            </g>
          </svg>
        </div>
      )}
    </>
  );
});

// Main Map component - manages layout and UI chrome
export default function BikeMap() {
  return (
    <MapLegendProvider>
      <div
        style={{
          width: '100vw',
          height: '100vh',
          position: 'relative',
          overflow: 'visible',
        }}
      >
        <MapboxMap />
      </div>
    </MapLegendProvider>
  );
}

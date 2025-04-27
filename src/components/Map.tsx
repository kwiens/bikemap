'use client';

import { useEffect, useRef, useState, memo, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import '@/app/map.css';
import { MapLegendProvider } from '@/components/MapLegend';
import { 
  bikeRoutes, 
  mapFeatures, 
  bikeResources
} from '@/data/geo_data';
import { 
  createLocationMarker,
  createAttractionMarker, 
  createBikeResourceMarker, 
  createHighlightMarker
} from '@/components/MapMarkers';
import { 
  fetchStationInformation, 
  fetchStationStatus, 
  gbfsToBikeRentalLocation,
  GBFSStationStatus,
  BikeRentalLocation
} from '@/data/gbfs';

// Initialize Mapbox access token
mapboxgl.accessToken = 'pk.eyJ1Ijoic3d1bGxlciIsImEiOiJjbThyZTVuMzEwMTZwMmpvdTRzM3JpMGlhIn0.CF5lzLSkkfO-c0qt6a168A';

// Function to geocode an address
const geocodeAddress = async (address: string): Promise<[number, number] | null> => {
  try {
    const response = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json?access_token=${mapboxgl.accessToken}&limit=1`
    );
    
    if (!response.ok) {
      throw new Error('Geocoding request failed');
    }
    
    const data = await response.json();
    
    if (data.features && data.features.length > 0) {
      const [lng, lat] = data.features[0].center;
      return [lng, lat];
    }
    return null;
  } catch (error) {
    console.error('Error geocoding address:', error);
    return null;
  }
};

// Debug location coordinates - set to null to use real location
const DEBUG_LOCATION: [number, number] = [-85.306739, 35.059623]; // Outdoor Chattanooga

// MapboxMap component - isolated from UI state changes
const MapboxMap = memo(function MapboxMap() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const locationMarker = useRef<mapboxgl.Marker | null>(null);
  const watchId = useRef<number | null>(null);
  let watchingLocation = false;
  let locationWatch: NodeJS.Timeout | undefined;

  // Track markers for attractions and bike resources
  const attractionMarkers = useRef<mapboxgl.Marker[]>([]);
  const bikeResourceMarkers = useRef<mapboxgl.Marker[]>([]);
  const bikeRentalMarkers = useRef<mapboxgl.Marker[]>([]);
  const [showAttractions, setShowAttractions] = useState(false);
  const [showBikeResources, setShowBikeResources] = useState(false);
  const [showBikeRentals, setShowBikeRentals] = useState(false);

  // Create location marker
  function initializeLocationMarker() {
    navigator.geolocation.watchPosition((position) => {
      if(!map.current) { return; }

      if(!locationMarker.current) {
        locationMarker.current = createLocationMarker(position.coords.longitude, position.coords.latitude);
        locationMarker.current.addTo(map.current);
        map.current.flyTo({
          center: [position.coords.longitude, position.coords.latitude],
          zoom: 15,
          essential: true,
          duration: 1000
        });
      } else {
        locationMarker.current?.setLngLat({lng: position.coords.longitude, lat: position.coords.latitude});
      }
    },
    (positionError) => {
      console.error(positionError);
      if(locationMarker.current) {
        locationMarker.current.remove();
        locationMarker.current = null;
      }
    });
  };

  function initializeGestureWatch() {
    if(!map.current) { return; }

    map.current.on('click', () => {
      setLocationWatch(false);
    });
    map.current.on('touch', () => {
      setLocationWatch(false);
    });
    map.current.on('touchend', () => {
      setLocationWatch(false);
    });
  }

  // Handle route selection events - outside the map initialization
  const handleRouteSelect = useCallback((event: CustomEvent) => {
    if (!map.current) {
      return;
    }
    
    const { routeId } = event.detail;
    
    // Update opacities for all routes
    bikeRoutes.forEach(route => {
      if (map.current) {
        try {
          map.current.setPaintProperty(
            route.id, 
            'line-opacity', 
            route.id === routeId ? 0.8 : 0.2
          );
        } catch (error) {
          console.error(`Error setting opacity for route ${route.id}:`, error);
        }
      }
    });

    // Find the selected route and its bounds
    const selectedRoute = bikeRoutes.find(route => route.id === routeId);
    
    if (selectedRoute?.bounds) {
      const bounds = selectedRoute.bounds;
      
      try {
        // Calculate the center of the bounds
        const centerLng = (bounds.getWest() + bounds.getEast()) / 2;
        const centerLat = (bounds.getNorth() + bounds.getSouth()) / 2;
        
        // Calculate a zoom level based on the bounds size
        // Smaller value = zoomed out more to show the whole route
        const latDiff = bounds.getNorth() - bounds.getSouth();
        const lngDiff = bounds.getEast() - bounds.getWest();
        const maxDiff = Math.max(latDiff, lngDiff);
        
        // Check if we're on mobile
        const isMobile = window.innerWidth <= 768;
        
        // Use a different zoom formula for mobile vs desktop
        // Mobile gets zoomed out more to show more context
        let zoom;
        if (isMobile) {
          // Mobile zoom - more zoomed out
          zoom = Math.max(11, 15 - maxDiff * 100);
        } else {
          // Desktop zoom - more zoomed in
          zoom = Math.max(13, 17 - maxDiff * 100);
        }
        
        // Use flyTo which tends to be more reliable
        map.current.flyTo({
          center: [centerLng, centerLat],
          zoom: zoom,
          essential: true,
          duration: 1000
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
  }, []);

  // Handle layer toggle events
  const handleLayerToggle = useCallback(async (event: CustomEvent) => {
    const { layer, visible } = event.detail;
    
    if (layer === 'bikeRentals') {
      setShowBikeRentals(visible);
      
      if (visible && map.current) {
        // First remove any existing markers to prevent duplicates
        bikeRentalMarkers.current.forEach((marker: mapboxgl.Marker) => marker.remove());
        
        try {
          // Fetch station information and status
          const [stations, statuses] = await Promise.all([
            fetchStationInformation(),
            fetchStationStatus()
          ]);

          // In the handleLayerToggle function, update the statusMap creation
          const statusMap: { [key: string]: GBFSStationStatus } = {};
          statuses.forEach(status => {
            statusMap[status.station_id] = status;
          });

          // Convert GBFS stations to our format and create markers
          const rentalLocations = stations.map(station => 
            gbfsToBikeRentalLocation(station, statusMap[station.station_id])
          );

          // Create markers for each rental location
          const markerPromises = rentalLocations.map(async (location: BikeRentalLocation) => {
            if (!map.current) return null;
            
            // Create element with FontAwesome bike icon
            const el = document.createElement('div');
            el.className = 'map-marker rental-marker';
            
            // Create icon container
            const icon = document.createElement('div');
            icon.className = 'marker-icon';
            
            // Create icon element
            const iconElement = document.createElement('i');
            iconElement.className = 'fas fa-bicycle';
            iconElement.style.color = '#9333EA';
            iconElement.style.fontSize = '22px';
            iconElement.style.position = 'relative';
            
            // Assemble the elements
            icon.appendChild(iconElement);
            el.appendChild(icon);
            
            // Create popup HTML with rental-specific information
            const popupHTML = `
              <div class="map-popup">
                <h3>${location.name}</h3>
                <p>${location.description}</p>
                <p class="address">
                  <strong>Address:</strong> 
                  <a href="https://maps.google.com/?q=${location.address}" target="_blank" rel="noopener noreferrer">
                    ${location.address}
                  </a>
                </p>
                <p><strong>Type:</strong> ${location.rentalType}</p>
                <p><strong>Price:</strong> ${location.price}</p>
                <p><strong>Hours:</strong> ${location.hours}</p>
                ${location.availableBikes !== undefined ? `<p><strong>Available Bikes:</strong> ${location.availableBikes}</p>` : ''}
                ${location.availableDocks !== undefined ? `<p><strong>Available Docks:</strong> ${location.availableDocks}</p>` : ''}
                ${location.isChargingStation ? '<p><strong>Charging Station Available</strong></p>' : ''}
              </div>
            `;
            
            // Create popup
            const popup = new mapboxgl.Popup({ 
              offset: 25,
              closeButton: true,
              closeOnClick: false,
              className: 'custom-popup'
            }).setHTML(popupHTML);

            const marker = new mapboxgl.Marker({
              element: el,
              anchor: 'bottom'
            });
            
            marker.setLngLat([location.longitude, location.latitude]);
            marker.setPopup(popup);
            
            return marker;
          });
          
          const rentalMarkers = await Promise.all(markerPromises);
          bikeRentalMarkers.current = rentalMarkers.filter((marker): marker is mapboxgl.Marker => marker !== null);
          
          // Add markers to map
          bikeRentalMarkers.current.forEach((marker: mapboxgl.Marker) => marker.addTo(map.current!));
        } catch (error) {
          console.error('Error fetching bike rental data:', error);
        }
      } else if (!visible) {
        // Remove markers from map but keep them in the array
        bikeRentalMarkers.current.forEach(marker => marker.remove());
      }
    }
    
    if (layer === 'attractions') {
      setShowAttractions(visible);
      
      if (visible && map.current) {
        // First remove any existing markers to prevent duplicates
        attractionMarkers.current.forEach(marker => marker.remove());
        
        // Check if we need to recreate the markers if array is empty
        if (attractionMarkers.current.length === 0) {
          // Re-initialize attraction markers using React components
          attractionMarkers.current = mapFeatures.map(feature => 
            createAttractionMarker(feature)
          );
        }
        
        // Add all markers to the map
        attractionMarkers.current.forEach(marker => {
          if (map.current) {
            marker.addTo(map.current);
          }
        });
      } else if (!visible) {
        // Remove markers from map but keep them in the array
        attractionMarkers.current.forEach(marker => marker.remove());
      }
    }
    
    if (layer === 'bikeResources') {
      setShowBikeResources(visible);
      
      if (visible && map.current) {
        // First remove any existing markers to prevent duplicates
        bikeResourceMarkers.current.forEach(marker => marker.remove());
        
        // Check if we need to recreate the markers if array is empty
        if (bikeResourceMarkers.current.length === 0) {
          // Re-initialize bike resource markers using React components
          bikeResourceMarkers.current = bikeResources.map(resource => 
            createBikeResourceMarker(resource)
          );
        }
        
        // Add all markers to the map
        bikeResourceMarkers.current.forEach(marker => {
          if (map.current) {
            marker.addTo(map.current);
          }
        });
      } else if (!visible) {
        // Remove markers from map but keep them in the array
        bikeResourceMarkers.current.forEach(marker => marker.remove());
      }
    }
    
    // Reset route opacity and dispatch event when any layer is toggled on
    if (visible) {
      bikeRoutes.forEach(route => {
        if (map.current) {
          map.current.setPaintProperty(route.id, 'line-opacity', 0.1);
        }
      });
      
      // Dispatch event to notify the MapLegend component
      window.dispatchEvent(new CustomEvent('route-deselect'));
    }
  }, []);

  // Handler for centering on a specific location
  const handleCenterLocation = useCallback(async (event: CustomEvent) => {
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
    else if (location.address) {
      coordinates = await geocodeAddress(location.address);
    }
    
    if (coordinates) {
      // Fly to the location
      map.current.flyTo({
        center: coordinates,
        zoom: 17,
        essential: true,
        duration: 1000
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
      const isAttraction = mapFeatures.some(
        feature => feature.latitude === coordinates![1] && feature.longitude === coordinates![0]
      );
      
      if (isAttraction && !showAttractions) {
        // Toggle attractions layer on
        window.dispatchEvent(new CustomEvent('layer-toggle', { 
          detail: { layer: 'attractions', visible: true } 
        }));
      }
      
      // Check if this location is a bike resource - show the markers if they're not already shown
      const isBikeResource = bikeResources.some(
        resource => resource.latitude === coordinates![1] && resource.longitude === coordinates![0]
      );
      
      if (isBikeResource && !showBikeResources) {
        // Toggle bike resources layer on
        window.dispatchEvent(new CustomEvent('layer-toggle', { 
          detail: { layer: 'bikeResources', visible: true } 
        }));
      }

      // Check if this location is a bike rental - show the markers if they're not already shown
      const isBikeRental = bikeRentalMarkers.current.some(
        marker => {
          const markerLngLat = marker.getLngLat();
          return markerLngLat.lng === coordinates![0] && markerLngLat.lat === coordinates![1];
        }
      );
      
      if (isBikeRental && !showBikeRentals) {
        // Toggle bike rentals layer on
        window.dispatchEvent(new CustomEvent('layer-toggle', { 
          detail: { layer: 'bikeRentals', visible: true } 
        }));
      }
      
      // Check if this is an attraction, bike resource, or bike rental and show the popup
      if (showAttractions) {
        const attractionMarker = attractionMarkers.current.find(
          marker => marker.getLngLat().lng === coordinates![0] && marker.getLngLat().lat === coordinates![1]
        );
        if (attractionMarker) {
          attractionMarker.togglePopup();
        }
      }
      
      if (showBikeResources) {
        const bikeMarker = bikeResourceMarkers.current.find(
          marker => marker.getLngLat().lng === coordinates![0] && marker.getLngLat().lat === coordinates![1]
        );
        if (bikeMarker) {
          bikeMarker.togglePopup();
        }
      }

      if (showBikeRentals) {
        const rentalMarker = bikeRentalMarkers.current.find(
          marker => {
            const markerLngLat = marker.getLngLat();
            return markerLngLat.lng === coordinates![0] && markerLngLat.lat === coordinates![1];
          }
        );
        if (rentalMarker) {
          rentalMarker.togglePopup();
        }
      }
    }
  }, [showAttractions, showBikeResources, showBikeRentals]);

  // Set up event listeners for map layers and location centering
  useEffect(() => {
    // Create stable wrapper functions that don't change between renders
    const layerToggleHandler = (e: Event) => handleLayerToggle(e as CustomEvent);
    const centerLocationHandler = (e: Event) => handleCenterLocation(e as CustomEvent);
    
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
    const routeSelectHandler = (e: Event) => handleRouteSelect(e as CustomEvent);
    
    window.addEventListener('route-select', routeSelectHandler);
    
    return () => {
      window.removeEventListener('route-select', routeSelectHandler);
    };
  }, [handleRouteSelect]);

  // Initialize map on component mount
  useEffect(() => {
    if (map.current) return; // already initialized
    
    // Helper function to ensure FontAwesome is loaded
    const ensureFontAwesomeLoaded = () => {
      if (!document.getElementById('fontawesome-css')) {
        const link = document.createElement('link');
        link.id = 'fontawesome-css';
        link.rel = 'stylesheet';
        link.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css';
        link.integrity = 'sha512-1ycn6IcaQQ40/MKBW2W4Rhis/DbILU74C1vSrLJxCq57o941Ym01SwNsOMqvEBFlcgUa6xLiPY/NS5R+E6ztJQ==';
        link.crossOrigin = 'anonymous';
        link.referrerPolicy = 'no-referrer';
        document.head.appendChild(link);
      }
    };
    
    // Initialize map
    if (mapContainer.current) {
      const initializeMap = async () => {
        try {
          // Ensure FontAwesome is loaded
          ensureFontAwesomeLoaded();
          
          const newMap = new mapboxgl.Map({
            container: mapContainer.current!,
            style: 'mapbox://styles/swuller/cm91zy289001p01qu4cdsdcgt',
            center: DEBUG_LOCATION, // Default to Chattanooga
            zoom: 14.89,
            pitch: -22.4,
            bearing: 11,
            antialias: true
          });
          
          map.current = newMap;
          
          // Add basic controls
          newMap.addControl(new mapboxgl.NavigationControl());
          
          // Wait for map to load
          await new Promise<void>((resolve) => {
            newMap.on('load', () => {
              // Log all available layers
              const style = newMap.getStyle();
              if (style && style.layers) {
                console.log('Available Map Layers:', style.layers);
              }
              resolve();
            });
          });

          // Set initial line width for specific layers
          const style = newMap.getStyle();
          if (style && style.layers) {
            style.layers.forEach((layer) => {
              if (layer.type === 'line') {
                const route = bikeRoutes.find(r => r.id === layer.id);
                if (route) {
                  newMap.setPaintProperty(layer.id, 'line-width', route.defaultWidth);
                  newMap.setPaintProperty(layer.id, 'line-color', route.color);
                  newMap.setPaintProperty(layer.id, 'line-opacity', 0.2); // Start with low opacity
                  
                  // Get the source and source-layer for this route
                  const sourceId = layer.source;
                  const sourceLayer = layer['source-layer'];
                  
                  if (sourceId && sourceLayer) {
                    // Query all features in this layer
                    const features = newMap.querySourceFeatures(sourceId, {
                      sourceLayer: sourceLayer
                    });
                    
                    if (features.length > 0) {
                      // Calculate bounds of all features
                      const bounds = new mapboxgl.LngLatBounds();
                      
                      features.forEach((feature: GeoJSON.Feature) => {
                        if (feature.geometry.type === 'LineString') {
                          feature.geometry.coordinates.forEach((coord: GeoJSON.Position) => {
                            bounds.extend(coord as [number, number]);
                          });
                        } else if (feature.geometry.type === 'MultiLineString') {
                          feature.geometry.coordinates.forEach((line: GeoJSON.Position[]) => {
                            line.forEach((coord: GeoJSON.Position) => {
                              bounds.extend(coord as [number, number]);
                            });
                          });
                        }
                      });
                      
                      // Only store bounds if we have valid coordinates
                      if (bounds.getNorth() !== undefined && bounds.getSouth() !== undefined) {
                        // Store the bounds for later use
                        route.bounds = bounds;
                      }
                    }
                  }
                }
              }
            });
          }
          
          // Force a resize to ensure proper display
          setTimeout(() => {
            if (map.current) map.current.resize();
          }, 100);

          initializeLocationMarker();
          initializeGestureWatch();
          
          // Clear existing marker arrays before initialization
          attractionMarkers.current = [];
          bikeResourceMarkers.current = [];
          bikeRentalMarkers.current = [];
          
          // Pre-create attraction markers using React components (they will be added to map only when toggled on)
          attractionMarkers.current = mapFeatures.map(feature => 
            createAttractionMarker(feature)
          );
          
          // Pre-create bike resource markers using React components
          bikeResourceMarkers.current = bikeResources.map(resource => 
            createBikeResourceMarker(resource)
          );
          
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

    // Cleanup event listener
    return () => {
      if (watchId.current !== null) {
        navigator.geolocation.clearWatch(watchId.current);
      }
      
      // Clean up all markers before removing the map
      if (locationMarker.current) {
        locationMarker.current.remove();
      }
      
      if (attractionMarkers.current.length > 0) {
        attractionMarkers.current.forEach(marker => marker.remove());
        attractionMarkers.current = [];
      }
      
      if (bikeResourceMarkers.current.length > 0) {
        bikeResourceMarkers.current.forEach(marker => marker.remove());
        bikeResourceMarkers.current = [];
      }
      
      if (bikeRentalMarkers.current.length > 0) {
        bikeRentalMarkers.current.forEach(marker => marker.remove());
        bikeRentalMarkers.current = [];
      }
      
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  });
  
  // Add resize event listener
  useEffect(() => {
    const handleResize = () => {
      if (map.current) {
        map.current.resize();
      }
    };
    
    window.addEventListener('resize', handleResize);
    
    // Listen for sidebar toggle events
    const handleSidebarToggle = () => {
      setTimeout(() => {
        if (map.current) {
          map.current.resize();
        }
      }, 300); // Longer delay to wait for transition
    };
    
    window.addEventListener('sidebar-toggle', handleSidebarToggle);
    
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('sidebar-toggle', handleSidebarToggle);
    };
  }, []);

  // Add cleanup for component unmount
  useEffect(() => {
    return () => {
      // Clean up all markers before unmounting
      if (locationMarker.current) {
        locationMarker.current.remove();
      }
      
      if (attractionMarkers.current.length > 0) {
        attractionMarkers.current.forEach(marker => marker.remove());
        attractionMarkers.current = [];
      }
      
      if (bikeResourceMarkers.current.length > 0) {
        bikeResourceMarkers.current.forEach(marker => marker.remove());
        bikeResourceMarkers.current = [];
      }
      
      if (bikeRentalMarkers.current.length > 0) {
        bikeRentalMarkers.current.forEach(marker => marker.remove());
        bikeRentalMarkers.current = [];
      }
      
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
      
      if (watchId.current !== null) {
        navigator.geolocation.clearWatch(watchId.current);
        watchId.current = null;
      }
    };
  }, []);

  const setLocationWatch = (value: boolean) => {
    watchingLocation = value;

    if(value) {
      locationWatch = setInterval(() => {
        if(!map.current) { return; }

        const lat = locationMarker.current?.getLngLat().lat;
        const lng = locationMarker.current?.getLngLat().lng;

        if(!lat || !lng) { return; }

        map.current.flyTo({
          center: [lng, lat],
          zoom: 15,
          essential: true,
          duration: 1000
        });
      }, 500);
    } else {
      clearInterval(locationWatch);
    }
  };

  // Toggle between real and debug location
  const toggleWatchLocation = () => {
    setLocationWatch(!watchingLocation);
  };

  return (
    <>
      <div ref={mapContainer} className="map-container" />
      
      {/* Debug mode toggle */}
      {DEBUG_LOCATION && (
        <div 
          onClick={toggleWatchLocation}
          className={`location-watch-toggle ${watchingLocation ? 'active' : 'inactive'}`}
        >
          <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" role="img" preserveAspectRatio="xMidYMid meet" fill="#000000"><g id="SVGRepo_bgCarrier"></g><g id="SVGRepo_tracerCarrier"></g><g id="SVGRepo_iconCarrier"><path d="M87.13 0a2.386 2.386 0 0 0-.64.088a2.386 2.386 0 0 0-.883.463L11.34 62.373a2.386 2.386 0 0 0 1.619 4.219l37.959-1.479l17.697 33.614a2.386 2.386 0 0 0 4.465-.707L89.486 2.79A2.386 2.386 0 0 0 87.131 0z" fill="#000000"></path></g></svg>
        </div>
      )}
    </>
  );
});

// Main Map component - manages layout and UI chrome
export default function Map() {
  return (
    <MapLegendProvider>
      <div style={{ 
        width: '100vw', 
        height: '100vh', 
        position: 'relative',
        overflow: 'visible'
      }}>
        <MapboxMap />
      </div>
    </MapLegendProvider>
  );
} 
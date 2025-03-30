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
  createHighlightMarker 
} from '@/components/MapMarkers';

// Initialize Mapbox access token
mapboxgl.accessToken = 'pk.eyJ1Ijoic3d1bGxlciIsImEiOiJjbThyZTVuMzEwMTZwMmpvdTRzM3JpMGlhIn0.CF5lzLSkkfO-c0qt6a168A';

// Debug location coordinates - set to null to use real location
const DEBUG_LOCATION: [number, number] = [-85.306739, 35.059623]; // Outdoor Chattanooga

// MapboxMap component - isolated from UI state changes
const MapboxMap = memo(function MapboxMap() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const locationMarker = useRef<mapboxgl.Marker | null>(null);
  const watchId = useRef<number | null>(null);
  const [isUsingDebugLocation, setIsUsingDebugLocation] = useState(false);
  // Track markers for attractions and bike resources
  const attractionMarkers = useRef<mapboxgl.Marker[]>([]);
  const bikeResourceMarkers = useRef<mapboxgl.Marker[]>([]);
  const [showAttractions, setShowAttractions] = useState(false);
  const [showBikeResources, setShowBikeResources] = useState(false);

  // Create location marker
  const createLocationMarkerHandler = useCallback((longitude: number, latitude: number) => {
    if (!map.current) return;
    
    // Don't create duplicate markers
    if (locationMarker.current) {
      locationMarker.current.setLngLat([longitude, latitude]);
      return;
    }
    
    // Create marker using the React component
    locationMarker.current = createLocationMarker(longitude, latitude);
    
    // Add to map
    if (map.current) {
      locationMarker.current.addTo(map.current);
    }
  }, []);

  // Start watching user location
  const startLocationWatch = useCallback(() => {
    // Skip if debug location is being used
    if (DEBUG_LOCATION && isUsingDebugLocation) {
      return;
    }
    
    if (!map.current) return;
    
    // Check if geolocation is available
    if (!navigator.geolocation) {
      return;
    }
    
    // Options for geolocation - using battery-friendly settings
    const options = {
      enableHighAccuracy: false, // Less battery usage
      timeout: 10000,           // 10-second timeout
      maximumAge: 60000         // Accept cached positions up to 1 minute old
    };
    
    // Function to handle location updates
    const handleLocationUpdate = (position: GeolocationPosition) => {
      const { longitude, latitude } = position.coords;
      
      // Create or update marker
      createLocationMarkerHandler(longitude, latitude);
      
      // Center map on first location fix if not already moving
      if (map.current && !map.current.isMoving()) {
        map.current.flyTo({
          center: [longitude, latitude],
          zoom: 15,
          essential: true
        });
      }
    };
    
    // Function to handle location errors
    const handleLocationError = (error: GeolocationPositionError) => {
      // Try to get a single position update as fallback
      if (error.code === error.TIMEOUT) {
        navigator.geolocation.getCurrentPosition(
          handleLocationUpdate, 
          handleLocationError, 
          options
        );
      }
    };
    
    // Start watching position
    watchId.current = navigator.geolocation.watchPosition(
      handleLocationUpdate,
      handleLocationError,
      options
    );
    
    // Return cleanup function
    return () => {
      if (watchId.current !== null) {
        navigator.geolocation.clearWatch(watchId.current);
        watchId.current = null;
      }
    };
  }, [isUsingDebugLocation, createLocationMarkerHandler]);

  // Simulate location updates when using debug location
  useEffect(() => {
    if (DEBUG_LOCATION && map.current && isUsingDebugLocation) {
      // Create the location marker with debug coordinates
      createLocationMarkerHandler(DEBUG_LOCATION[0], DEBUG_LOCATION[1]);
      
      // Center map on debug location
      map.current.flyTo({
        center: DEBUG_LOCATION,
        zoom: 15,
        essential: true
      });
    }
  }, [isUsingDebugLocation, createLocationMarkerHandler]);

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
  const handleLayerToggle = useCallback((event: CustomEvent) => {
    const { layer, visible } = event.detail;
    
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
          map.current.setPaintProperty(route.id, 'line-opacity', 0.2);
        }
      });
      
      // Dispatch event to notify the MapLegend component
      window.dispatchEvent(new CustomEvent('route-deselect'));
    }
  }, []);

  // Handler for centering on a specific location
  const handleCenterLocation = useCallback((event: CustomEvent) => {
    if (!map.current) {
      return;
    }
    
    const { location } = event.detail;
    
    if (location && location.latitude && location.longitude) {
      // Fly to the location
      map.current.flyTo({
        center: [location.longitude, location.latitude],
        zoom: 17,
        essential: true,
        duration: 1000
      });
      
      // Create a temporary highlight marker using React component
      const marker = createHighlightMarker(location.longitude, location.latitude);

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
        feature => feature.latitude === location.latitude && feature.longitude === location.longitude
      );
      
      if (isAttraction && !showAttractions) {
        // Toggle attractions layer on
        window.dispatchEvent(new CustomEvent('layer-toggle', { 
          detail: { layer: 'attractions', visible: true } 
        }));
      }
      
      // Check if this location is a bike resource - show the markers if they're not already shown
      const isBikeResource = bikeResources.some(
        resource => resource.latitude === location.latitude && resource.longitude === location.longitude
      );
      
      if (isBikeResource && !showBikeResources) {
        // Toggle bike resources layer on
        window.dispatchEvent(new CustomEvent('layer-toggle', { 
          detail: { layer: 'bikeResources', visible: true } 
        }));
      }
      
      // Check if this is an attraction or bike resource and show the popup
      if (showAttractions) {
        const attractionMarker = attractionMarkers.current.find(
          marker => marker.getLngLat().lng === location.longitude && marker.getLngLat().lat === location.latitude
        );
        if (attractionMarker) {
          attractionMarker.togglePopup();
        }
      }
      
      if (showBikeResources) {
        const bikeMarker = bikeResourceMarkers.current.find(
          marker => marker.getLngLat().lng === location.longitude && marker.getLngLat().lat === location.latitude
        );
        if (bikeMarker) {
          bikeMarker.togglePopup();
        }
      }
    }
  }, [showAttractions, showBikeResources]);

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
      try {
        // Ensure FontAwesome is loaded
        ensureFontAwesomeLoaded();
        
        const newMap = new mapboxgl.Map({
          container: mapContainer.current,
          style: 'mapbox://styles/swuller/cm8re9zyp004q01qkek8pdrsk',
          center: DEBUG_LOCATION, // Default to Chattanooga
          zoom: 14.89,
          pitch: -22.4,
          bearing: 11,
          antialias: true
        });
        
        map.current = newMap;
        
        // Add basic controls
        newMap.addControl(new mapboxgl.NavigationControl());
        
        // Log when map is loaded
        newMap.on('load', () => {
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
          
          // If using debug location, create marker
          if (DEBUG_LOCATION && isUsingDebugLocation) {
            createLocationMarkerHandler(DEBUG_LOCATION[0], DEBUG_LOCATION[1]);
          } else {
            // Otherwise start real location tracking
            startLocationWatch();
          }
          
          // Initialize attraction and bike resource markers (but don't display yet)
          
          // Clear existing marker arrays before initialization
          attractionMarkers.current = [];
          bikeResourceMarkers.current = [];
          
          // Pre-create attraction markers using React components (they will be added to map only when toggled on)
          attractionMarkers.current = mapFeatures.map(feature => 
            createAttractionMarker(feature)
          );
          
          // Pre-create bike resource markers using React components
          bikeResourceMarkers.current = bikeResources.map(resource => 
            createBikeResourceMarker(resource)
          );
        });

        // Handle errors
        newMap.on('error', (e) => {
          console.error('Map error:', e);
        });

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
          
          if (map.current) {
            map.current.remove();
            map.current = null;
          }
        };
      } catch (error) {
        console.error('Error initializing map:', error);
      }
    }
  }, [isUsingDebugLocation, startLocationWatch, createLocationMarkerHandler]);
  
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

  // Toggle between real and debug location
  const toggleDebugLocation = () => {
    setIsUsingDebugLocation(prev => !prev);
  };

  return (
    <>
      <div ref={mapContainer} className="map-container" />
      
      {/* Debug mode toggle */}
      {DEBUG_LOCATION && (
        <div 
          onClick={toggleDebugLocation}
          className={`debug-location-toggle ${isUsingDebugLocation ? 'active' : 'inactive'}`}
        >
          {isUsingDebugLocation ? 'Using Debug Location' : 'Using Real Location'}
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
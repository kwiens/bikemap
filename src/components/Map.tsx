'use client';

import { useEffect, useRef, useState, memo, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { MapLegendProvider, mapFeatures, bikeResources } from '@/components/MapLegend';
import { bikeRoutes } from '@/data/bike_routes';

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
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isUsingDebugLocation, setIsUsingDebugLocation] = useState(false);
  // Track markers for attractions and bike resources
  const attractionMarkers = useRef<mapboxgl.Marker[]>([]);
  const bikeResourceMarkers = useRef<mapboxgl.Marker[]>([]);
  const [showAttractions, setShowAttractions] = useState(false);
  const [showBikeResources, setShowBikeResources] = useState(false);

  // Function to update line width
  const updateLineWidth = useCallback((layerId: string, width: number) => {
    if (!map.current) return;
    
    console.log(`Updating line width for ${layerId} to ${width}`);
    map.current.setPaintProperty(layerId, 'line-width', width);
  }, []);

  // Create location marker (using the styled approach from previous code)
  const createLocationMarker = useCallback((longitude: number, latitude: number) => {
    if (!map.current) return;
    
    // Don't create duplicate markers
    if (locationMarker.current) {
      locationMarker.current.setLngLat([longitude, latitude]);
      return;
    }
    
    console.log('Creating location marker at', [longitude, latitude]);
    
    // Create marker element with classes
    const el = document.createElement('div');
    el.className = 'current-location-marker';
    
    // Create inner elements
    el.innerHTML = `
      <div class="location-dot"></div>
      <div class="location-pulse"></div>
    `;
    
    // Create and store marker instance
    locationMarker.current = new mapboxgl.Marker({
      element: el,
      anchor: 'center'
    })
    .setLngLat([longitude, latitude])
    .addTo(map.current);
    
    // Add CSS styles if not already present
    if (!document.getElementById('location-marker-style')) {
      const style = document.createElement('style');
      style.id = 'location-marker-style';
      style.textContent = `
        .current-location-marker {
          width: 22px;
          height: 22px;
          position: relative;
        }
        
        .location-dot {
          background: #4285F4;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          border: 3px solid white;
          box-shadow: 0 0 3px rgba(0, 0, 0, 0.2);
        }
        
        .location-pulse {
          background: rgba(66, 133, 244, 0.15);
          width: 22px;
          height: 22px;
          border-radius: 50%;
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          animation: pulse 2s ease-out infinite;
        }
        
        @keyframes pulse {
          0% {
            transform: translate(-50%, -50%) scale(0.5);
            opacity: 1;
          }
          100% {
            transform: translate(-50%, -50%) scale(2);
            opacity: 0;
          }
        }
      `;
      document.head.appendChild(style);
    }
  }, []);

  // Start watching user location
  const startLocationWatch = useCallback(() => {
    // Skip if debug location is being used
    if (DEBUG_LOCATION && isUsingDebugLocation) {
      return;
    }
    
    if (!map.current) return;
    console.log('Starting location watch');
    
    // Check if geolocation is available
    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported by your browser');
      return;
    }
    
    // Options for geolocation - using battery-friendly settings from original code
    const options = {
      enableHighAccuracy: false, // Less battery usage
      timeout: 10000,           // 10-second timeout
      maximumAge: 60000         // Accept cached positions up to 1 minute old
    };
    
    // Function to handle location updates
    const handleLocationUpdate = (position: GeolocationPosition) => {
      const { longitude, latitude } = position.coords;
      console.log(`Location updated: [${longitude}, ${latitude}]`);
      
      // Clear any previous errors
      setLocationError(null);
      
      // Create or update marker
      createLocationMarker(longitude, latitude);
      
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
      // Just log the error without showing it to the user
      console.log('Location service not available:', error.message);
      
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
        console.log('Location watch cleared');
      }
    };
  }, [isUsingDebugLocation, createLocationMarker]);

  // Simulate location updates when using debug location
  useEffect(() => {
    if (DEBUG_LOCATION && map.current && isUsingDebugLocation) {
      // Create the location marker with debug coordinates
      createLocationMarker(DEBUG_LOCATION[0], DEBUG_LOCATION[1]);
      
      // Center map on debug location
      map.current.flyTo({
        center: DEBUG_LOCATION,
        zoom: 15,
        essential: true
      });
      
      console.log('Using debug location:', DEBUG_LOCATION);
    }
  }, [isUsingDebugLocation, createLocationMarker]);

  // Debug: Add function to test opacity changes directly
  const testOpacityChange = useCallback(() => {
    if (!map.current) {
      console.log('TEST: No map instance available for opacity test');
      return;
    }
    
    console.log('TEST: Available bike routes:', bikeRoutes.map(r => r.id));
    
    // Log all map layers for comparison
    const style = map.current.getStyle();
    const mapLayers = style && style.layers ? style.layers : [];
    console.log('TEST: Available map layers:', mapLayers.map(l => l.id));
    
    // Try setting opacity directly
    const routeId = bikeRoutes[0].id;
    console.log(`TEST: Attempting to set opacity for route ${routeId} to 0.8`);
    
    try {
      map.current.setPaintProperty(routeId, 'line-opacity', 0.8);
      console.log(`TEST: Successfully set opacity for ${routeId}`);
    } catch (error) {
      console.error('TEST: Error setting opacity:', error);
    }
  }, []);

  // Handle route selection events - outside the map initialization
  const handleRouteSelect = useCallback((event: CustomEvent) => {
    console.log('Map: Received route-select event:', event);
    
    if (!map.current) {
      console.log('Map: No map instance available');
      return;
    }
    
    const { routeId } = event.detail;
    console.log(`Map: Route selected: ${routeId}`);
    
    // Update opacities for all routes
    bikeRoutes.forEach(route => {
      if (map.current) {
        console.log(`Map: Setting opacity for route ${route.id} to ${route.id === routeId ? 0.8 : 0.2}`);
        try {
          map.current.setPaintProperty(
            route.id, 
            'line-opacity', 
            route.id === routeId ? 0.8 : 0.2
          );
        } catch (error) {
          console.error(`Map: Error setting opacity for route ${route.id}:`, error);
        }
      }
    });

    // Find the selected route and its bounds
    const selectedRoute = bikeRoutes.find(route => route.id === routeId);
    console.log('Map: Selected route:', selectedRoute);
    
    if (selectedRoute?.bounds) {
      const bounds = selectedRoute.bounds;
      console.log(`Map: Flying to route "${selectedRoute.name}":`, {
        north: bounds.getNorth(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        west: bounds.getWest()
      });
      
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
        console.log(`Device detected as: ${isMobile ? 'mobile' : 'desktop'}`);
        
        // Use a different zoom formula for mobile vs desktop
        // Mobile gets zoomed out more to show more context
        let zoom;
        if (isMobile) {
          // Mobile zoom - more zoomed out
          zoom = Math.max(11, 15 - maxDiff * 100);
          console.log('Using mobile zoom level:', zoom);
        } else {
          // Desktop zoom - more zoomed in
          zoom = Math.max(13, 17 - maxDiff * 100);
          console.log('Using desktop zoom level:', zoom);
        }
        
        console.log(`Map: Flying to center of route [${centerLng}, ${centerLat}] with zoom ${zoom}`);
        
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
        console.error('Map: Error flying to route:', error);
      }
    } else {
      console.log(`Map: No bounds found for route "${selectedRoute?.name}"`);
    }
  }, []);

  // Handle layer toggle events
  const handleLayerToggle = useCallback((event: CustomEvent) => {
    console.log('Map: Received layer-toggle event:', event);
    
    const { layer, visible } = event.detail;
    
    if (layer === 'attractions') {
      console.log(`Map: Setting attractions visibility to ${visible}`);
      setShowAttractions(visible);
      
      if (visible && map.current) {
        console.log('Map: Showing attraction markers');
        
        // First remove any existing markers to prevent duplicates
        attractionMarkers.current.forEach(marker => marker.remove());
        
        // Check if we need to recreate the markers if array is empty
        if (attractionMarkers.current.length === 0) {
          console.log('Map: Recreating attraction markers as array is empty');
          // Re-initialize attraction markers
          mapFeatures.forEach((feature: any) => {
            const el = document.createElement('div');
            el.className = 'map-marker attraction-marker';
            
            const icon = document.createElement('div');
            icon.className = 'marker-icon';
            
            let iconClass = 'marker-default-icon';
            if (feature.icon) {
              switch (feature.icon.iconName) {
                case 'fish': iconClass = 'marker-aquarium-icon'; break;
                case 'paw': iconClass = 'marker-zoo-icon'; break;
                case 'train': iconClass = 'marker-train-icon'; break;
                case 'gamepad': iconClass = 'marker-game-icon'; break;
                default: iconClass = 'marker-default-icon';
              }
            }
            
            icon.classList.add(iconClass);
            el.appendChild(icon);
            
            const popup = new mapboxgl.Popup({ 
              offset: 25,
              closeButton: true,
              closeOnClick: false,
              className: 'custom-popup'
            })
              .setHTML(`
                <div class="map-popup">
                  <h3>${feature.name}</h3>
                  <p>${feature.description}</p>
                  <p class="address">
                    <strong>Address:</strong> 
                    <a href="https://maps.google.com/?q=${feature.address}" target="_blank" rel="noopener noreferrer">
                      ${feature.address}
                    </a>
                  </p>
                </div>
              `);
            
            const marker = new mapboxgl.Marker(el)
              .setLngLat([feature.longitude, feature.latitude])
              .setPopup(popup);
            
            attractionMarkers.current.push(marker);
          });
        }
        
        // Add all markers to the map
        attractionMarkers.current.forEach(marker => {
          if (map.current) {
            marker.addTo(map.current);
          }
        });
      } else if (!visible) {
        console.log('Map: Hiding attraction markers');
        // Remove markers from map but keep them in the array
        attractionMarkers.current.forEach(marker => marker.remove());
      }
    }
    
    if (layer === 'bikeResources') {
      console.log(`Map: Setting bike resources visibility to ${visible}`);
      setShowBikeResources(visible);
      
      if (visible && map.current) {
        console.log('Map: Showing bike resource markers');
        
        // First remove any existing markers to prevent duplicates
        bikeResourceMarkers.current.forEach(marker => marker.remove());
        
        // Check if we need to recreate the markers if array is empty
        if (bikeResourceMarkers.current.length === 0) {
          console.log('Map: Recreating bike resource markers as array is empty');
          // Re-initialize bike resource markers
          bikeResources.forEach((resource: any) => {
            const el = document.createElement('div');
            el.className = 'map-marker bike-marker';
            
            const icon = document.createElement('div');
            icon.className = 'marker-icon';
            
            let iconClass = 'marker-bike-icon';
            if (resource.icon) {
              switch (resource.icon.iconName) {
                case 'bicycle': iconClass = 'marker-bike-icon'; break;
                case 'mountain': iconClass = 'marker-mountain-bike-icon'; break;
                case 'road': iconClass = 'marker-road-bike-icon'; break;
                case 'bolt': iconClass = 'marker-ebike-icon'; break;
                case 'hands-helping': iconClass = 'marker-nonprofit-icon'; break;
                default: iconClass = 'marker-bike-icon';
              }
            }
            
            icon.classList.add(iconClass);
            el.appendChild(icon);
            
            const popup = new mapboxgl.Popup({ 
              offset: 25,
              closeButton: true,
              closeOnClick: false,
              className: 'custom-popup'
            })
              .setHTML(`
                <div class="map-popup">
                  <h3>${resource.name}</h3>
                  <p>${resource.description}</p>
                  <p class="address">
                    <strong>Address:</strong> 
                    <a href="https://maps.google.com/?q=${resource.address}" target="_blank" rel="noopener noreferrer">
                      ${resource.address}
                    </a>
                  </p>
                </div>
              `);
            
            const marker = new mapboxgl.Marker(el)
              .setLngLat([resource.longitude, resource.latitude])
              .setPopup(popup);
            
            bikeResourceMarkers.current.push(marker);
          });
        }
        
        // Add all markers to the map
        bikeResourceMarkers.current.forEach(marker => {
          if (map.current) {
            marker.addTo(map.current);
          }
        });
      } else if (!visible) {
        console.log('Map: Hiding bike resource markers');
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
    console.log('Map: Received center-location event:', event);
    
    if (!map.current) {
      console.log('Map: No map instance available');
      return;
    }
    
    const { location } = event.detail;
    
    if (location && location.latitude && location.longitude) {
      console.log(`Map: Centering on location [${location.longitude}, ${location.latitude}]`);
      
      // Fly to the location
      map.current.flyTo({
        center: [location.longitude, location.latitude],
        zoom: 17,
        essential: true,
        duration: 1000
      });
      
      // Create a temporary highlight marker
      const el = document.createElement('div');
      el.className = 'highlight-marker';
      
      // Add CSS for highlight marker if not already present
      if (!document.getElementById('highlight-marker-style')) {
        const style = document.createElement('style');
        style.id = 'highlight-marker-style';
        style.textContent = `
          .highlight-marker {
            width: 50px;
            height: 50px;
            border-radius: 50%;
            background-color: rgba(59, 130, 246, 0.3);
            animation: pulse-highlight 2s ease-out infinite;
          }
          
          @keyframes pulse-highlight {
            0% {
              transform: scale(0.8);
              opacity: 1;
            }
            100% {
              transform: scale(2);
              opacity: 0;
            }
          }
        `;
        document.head.appendChild(style);
      }
      
      // Create and add temporary highlight marker
      const marker = new mapboxgl.Marker(el)
        .setLngLat([location.longitude, location.latitude]);

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
        console.log('Map: Location is an attraction but layer is not visible. Toggling attractions layer on.');
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
        console.log('Map: Location is a bike resource but layer is not visible. Toggling bike resources layer on.');
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
    } else {
      console.log('Map: Invalid location data', location);
    }
  }, [showAttractions, showBikeResources]);

  // Set up event listeners for map layers and location centering
  useEffect(() => {
    console.log('Setting up layer-toggle and center-location event listeners');
    
    // Create stable wrapper functions that don't change between renders
    const layerToggleHandler = (e: Event) => handleLayerToggle(e as CustomEvent);
    const centerLocationHandler = (e: Event) => handleCenterLocation(e as CustomEvent);
    
    window.addEventListener('layer-toggle', layerToggleHandler);
    window.addEventListener('center-location', centerLocationHandler);
    
    return () => {
      console.log('Removing layer-toggle and center-location event listeners');
      window.removeEventListener('layer-toggle', layerToggleHandler);
      window.removeEventListener('center-location', centerLocationHandler);
    };
  }, []); // Empty dependency array - only run once on mount

  // Set up route-select event listener outside the map initialization
  useEffect(() => {
    console.log('Setting up route-select event listener');
    
    // Create stable wrapper function that doesn't change between renders
    const routeSelectHandler = (e: Event) => handleRouteSelect(e as CustomEvent);
    
    window.addEventListener('route-select', routeSelectHandler);
    
    return () => {
      console.log('Removing route-select event listener');
      window.removeEventListener('route-select', routeSelectHandler);
    };
  }, []); // Empty dependency array - only run once on mount

  // Initialize map on component mount
  useEffect(() => {
    if (map.current) return; // already initialized
    
    console.log('Attempting to initialize map');
    
    // Initialize map
    if (mapContainer.current) {
      console.log('Container exists, initializing map');
      
      try {
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
          console.log('Map loaded successfully');
          
          // Log all layers in the style
          console.log('Available layers in style:');
          const style = newMap.getStyle();
          if (style && style.layers) {
            style.layers.forEach((layer, index) => {
              console.log(`${index + 1}. Layer ID: "${layer.id}", Type: "${layer.type}"`);
              
              // Set initial line width for specific layers
              if (layer.type === 'line') {
                const route = bikeRoutes.find(r => r.id === layer.id);
                if (route) {
                  console.log(`Setting initial line properties for layer: ${layer.id}`);
                  newMap.setPaintProperty(layer.id, 'line-width', route.defaultWidth);
                  newMap.setPaintProperty(layer.id, 'line-color', route.color);
                  newMap.setPaintProperty(layer.id, 'line-opacity', 0.2); // Start with low opacity
                  
                  // Get the source and source-layer for this route
                  const sourceId = layer.source;
                  const sourceLayer = layer['source-layer'];
                  
                  if (sourceId && sourceLayer) {
                    console.log(`Querying features for route "${route.name}" from source "${sourceId}" layer "${sourceLayer}"`);
                    
                    // Query all features in this layer
                    const features = newMap.querySourceFeatures(sourceId, {
                      sourceLayer: sourceLayer
                    });
                    
                    console.log(`Found ${features.length} features for route "${route.name}"`);
                    
                    if (features.length > 0) {
                      // Log feature details for debugging
                      console.log(`Feature details for route "${route.name}":`, {
                        firstFeature: features[0],
                        featureCount: features.length,
                        geometryTypes: [...new Set(features.map(f => f.geometry.type))]
                      });
                      
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
                        
                        console.log(`Bounds for route "${route.name}":`, {
                          north: bounds.getNorth(),
                          south: bounds.getSouth(),
                          east: bounds.getEast(),
                          west: bounds.getWest()
                        });
                      } else {
                        console.log(`No valid bounds found for route "${route.name}"`);
                      }
                    } else {
                      console.log(`No features found for route "${route.name}". Layer details:`, {
                        sourceId,
                        sourceLayer,
                        layerId: layer.id
                      });
                    }
                  } else {
                    console.log(`Could not find source information for route "${route.name}"`, {
                      sourceId,
                      sourceLayer
                    });
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
            createLocationMarker(DEBUG_LOCATION[0], DEBUG_LOCATION[1]);
          } else {
            // Otherwise start real location tracking
            startLocationWatch();
          }
          
          // Initialize attraction and bike resource markers (but don't display yet)
          console.log('Initializing attraction and bike resource markers');
          
          // Clear existing marker arrays before initialization
          attractionMarkers.current = [];
          bikeResourceMarkers.current = [];
          
          // Pre-create attraction markers (they will be added to map only when toggled on)
          console.log(`Creating ${mapFeatures.length} attraction markers`);
          mapFeatures.forEach((feature: any) => {
            // Create element for marker
            const el = document.createElement('div');
            el.className = 'map-marker attraction-marker';
            
            // Add icon
            const icon = document.createElement('div');
            icon.className = 'marker-icon';
            
            // Add icon based on attraction type
            let iconClass = 'marker-default-icon';
            if (feature.icon) {
              switch (feature.icon.iconName) {
                case 'fish': iconClass = 'marker-aquarium-icon'; break;
                case 'paw': iconClass = 'marker-zoo-icon'; break;
                case 'train': iconClass = 'marker-train-icon'; break;
                case 'gamepad': iconClass = 'marker-game-icon'; break;
                default: iconClass = 'marker-default-icon';
              }
            }
            
            icon.classList.add(iconClass);
            el.appendChild(icon);
            
            // Create popup with attraction details
            const popup = new mapboxgl.Popup({ 
              offset: 25,
              closeButton: true,
              closeOnClick: false,
              className: 'custom-popup'
            })
              .setHTML(`
                <div class="map-popup">
                  <h3>${feature.name}</h3>
                  <p>${feature.description}</p>
                  <p class="address">
                    <strong>Address:</strong> 
                    <a href="https://maps.google.com/?q=${feature.address}" target="_blank" rel="noopener noreferrer">
                      ${feature.address}
                    </a>
                  </p>
                </div>
              `);
            
            // Create marker but don't add to map yet
            const marker = new mapboxgl.Marker(el)
              .setLngLat([feature.longitude, feature.latitude])
              .setPopup(popup);
            
            // Store in ref for later use
            attractionMarkers.current.push(marker);
            console.log(`Created attraction marker for ${feature.name} at [${feature.longitude}, ${feature.latitude}]`);
          });
          
          // Pre-create bike resource markers
          console.log(`Creating ${bikeResources.length} bike resource markers`);
          bikeResources.forEach((resource: any) => {
            // Create element for marker
            const el = document.createElement('div');
            el.className = 'map-marker bike-marker';
            
            // Add icon
            const icon = document.createElement('div');
            icon.className = 'marker-icon';
            
            // Add icon based on resource type
            let iconClass = 'marker-bike-icon';
            if (resource.icon) {
              switch (resource.icon.iconName) {
                case 'bicycle': iconClass = 'marker-bike-icon'; break;
                case 'mountain': iconClass = 'marker-mountain-bike-icon'; break;
                case 'road': iconClass = 'marker-road-bike-icon'; break;
                case 'bolt': iconClass = 'marker-ebike-icon'; break;
                case 'hands-helping': iconClass = 'marker-nonprofit-icon'; break;
                default: iconClass = 'marker-bike-icon';
              }
            }
            
            icon.classList.add(iconClass);
            el.appendChild(icon);
            
            // Create popup with resource details
            const popup = new mapboxgl.Popup({ 
              offset: 25,
              closeButton: true,
              closeOnClick: false,
              className: 'custom-popup'
            })
              .setHTML(`
                <div class="map-popup">
                  <h3>${resource.name}</h3>
                  <p>${resource.description}</p>
                  <p class="address">
                    <strong>Address:</strong> 
                    <a href="https://maps.google.com/?q=${resource.address}" target="_blank" rel="noopener noreferrer">
                      ${resource.address}
                    </a>
                  </p>
                </div>
              `);
            
            // Create marker but don't add to map yet
            const marker = new mapboxgl.Marker(el)
              .setLngLat([resource.longitude, resource.latitude])
              .setPopup(popup);
            
            // Store in ref for later use
            bikeResourceMarkers.current.push(marker);
            console.log(`Created bike resource marker for ${resource.name} at [${resource.longitude}, ${resource.latitude}]`);
          });
          
          // Add CSS for markers if not already present
          if (!document.getElementById('map-markers-style')) {
            const style = document.createElement('style');
            style.id = 'map-markers-style';
            style.textContent = `
              .map-marker {
                cursor: pointer;
              }
              
              .attraction-marker .marker-icon,
              .bike-marker .marker-icon {
                width: 48px;
                height: 48px;
                border-radius: 50%;
                background-color: #ffffff;
                display: flex;
                align-items: center;
                justify-content: center;
                box-shadow: 0 3px 8px rgba(0,0,0,0.3);
                position: relative;
              }
              
              .attraction-marker .marker-icon {
                border: 3px solid #3b82f6;
              }
              
              .bike-marker .marker-icon {
                border: 3px solid #34d399;
              }
              
              .marker-icon::before {
                position: relative;
                top: -3px; /* Move icons up to center them better */
                font-size: 24px;
              }
              
              .marker-aquarium-icon::before {
                content: "🐠";
              }
              
              .marker-zoo-icon::before {
                content: "🐘";
              }
              
              .marker-train-icon::before {
                content: "🚂";
              }
              
              .marker-game-icon::before {
                content: "🎮";
              }
              
              .marker-default-icon::before {
                content: "📍";
              }
              
              .marker-bike-icon::before {
                content: "🚲";
              }
              
              .marker-mountain-bike-icon::before {
                content: "🏔️";
              }
              
              .marker-road-bike-icon::before {
                content: "🛣";
              }
              
              .marker-ebike-icon::before {
                content: "⚡";
              }
              
              .marker-nonprofit-icon::before {
                content: "❤️";
              }
              
              /* Custom popup styling */
              .custom-popup {
                border-radius: 12px !important;
                overflow: hidden;
              }
              
              .custom-popup .mapboxgl-popup-content {
                border-radius: 12px;
                padding: 15px;
                box-shadow: 0 3px 8px rgba(0,0,0,0.15);
              }
              
              .custom-popup .mapboxgl-popup-close-button {
                font-size: 22px;
                color: #666;
                padding: 8px;
                right: 5px;
                top: 5px;
                line-height: 0.5;
                border-radius: 50%;
                transition: background-color 0.2s;
              }
              
              .custom-popup .mapboxgl-popup-close-button:hover {
                background-color: rgba(0,0,0,0.05);
              }
              
              .map-popup {
                padding: 8px;
                max-width: 280px;
              }
              
              .map-popup h3 {
                margin-top: 0;
                margin-bottom: 8px;
                font-size: 16px;
                font-weight: 600;
              }
              
              .map-popup p {
                margin-bottom: 8px;
                font-size: 14px;
                line-height: 1.4;
              }
              
              .map-popup p.address {
                margin-top: 10px;
                border-top: 1px solid #eee;
                padding-top: 8px;
              }
              
              .map-popup a {
                color: #3b82f6;
                text-decoration: none;
              }
              
              .map-popup a:hover {
                text-decoration: underline;
              }
              
              .highlight-marker {
                width: 50px;
                height: 50px;
                border-radius: 50%;
                background-color: rgba(59, 130, 246, 0.3);
                animation: pulse-highlight 2s ease-out infinite;
              }
              
              @keyframes pulse-highlight {
                0% {
                  transform: scale(0.8);
                  opacity: 1;
                }
                100% {
                  transform: scale(2);
                  opacity: 0;
                }
              }
            `;
            document.head.appendChild(style);
          }
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
          if (map.current) {
            map.current.remove();
            map.current = null;
          }
        };
      } catch (error) {
        console.error('Error initializing map:', error);
      }
    }
    
    // Cleanup on unmount
    return () => {
      if (watchId.current !== null) {
        navigator.geolocation.clearWatch(watchId.current);
      }
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, [isUsingDebugLocation, startLocationWatch, createLocationMarker]);
  
  // Add resize event listener
  useEffect(() => {
    const handleResize = () => {
      if (map.current) {
        console.log('Handling window resize');
        map.current.resize();
      }
    };
    
    window.addEventListener('resize', handleResize);
    
    // Listen for sidebar toggle events
    const handleSidebarToggle = () => {
      console.log('Handling sidebar toggle event');
      setTimeout(() => {
        if (map.current) {
          console.log('Resizing map after sidebar toggle');
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

  // Toggle between real and debug location
  const toggleDebugLocation = () => {
    setIsUsingDebugLocation(prev => !prev);
  };

  return (
    <>
      <div 
        ref={mapContainer}
        style={{ 
          width: '100%', 
          height: '100%',
          position: 'absolute', 
          top: 0, 
          left: 0, 
          right: 0, 
          bottom: 0,
          zIndex: 500 // Add z-index to ensure map and its controls are visible
        }}
      />
      
      {/* Debug mode toggle */}
      {DEBUG_LOCATION && (
        <div 
          onClick={toggleDebugLocation}
          style={{
            position: 'absolute',
            bottom: '20px',
            left: '20px',
            backgroundColor: isUsingDebugLocation ? 'rgba(67, 56, 202, 0.9)' : 'rgba(75, 85, 99, 0.9)',
            color: 'white',
            padding: '6px 12px',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '12px',
            zIndex: 900,
            boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
          }}
        >
          {isUsingDebugLocation ? 'Using Debug Location' : 'Using Real Location'}
        </div>
      )}


    </>
  );
});

// Main Map component - manages layout and UI chrome
export default function Map() {
  // Log when the component mounts for debugging
  useEffect(() => {
    console.log('Map component mounted');
  }, []);

  return (
    <MapLegendProvider>
      <div style={{ 
        width: '100vw', 
        height: '100vh', 
        position: 'relative',
        // Allow controls to be visible even if they extend beyond the container
        overflow: 'visible'
      }}>
        <MapboxMap />
      </div>
    </MapLegendProvider>
  );
} 
'use client';

import { useEffect, useRef, useState, memo } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { MapLegendProvider } from '@/components/MapLegend';

// Initialize Mapbox access token
mapboxgl.accessToken = 'pk.eyJ1Ijoic3d1bGxlciIsImEiOiJjbThyZTVuMzEwMTZwMmpvdTRzM3JpMGlhIn0.CF5lzLSkkfO-c0qt6a168A';

// Debug location coordinates - set to null to use real location
// const DEBUG_LOCATION: [number, number] | null = null; // Use real location
const DEBUG_LOCATION: [number, number] = [-85.31225, 35.04828]; // Chattanooga

// MapboxMap component - isolated from UI state changes
const MapboxMap = memo(function MapboxMap() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const locationMarker = useRef<mapboxgl.Marker | null>(null);
  const watchId = useRef<number | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isUsingDebugLocation, setIsUsingDebugLocation] = useState(!!DEBUG_LOCATION);
  
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
  }, [isUsingDebugLocation]);

  // Create location marker (using the styled approach from previous code)
  const createLocationMarker = (longitude: number, latitude: number) => {
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
  };
  
  // Start watching user location
  const startLocationWatch = () => {
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
      let errorMsg;
      
      switch (error.code) {
        case error.PERMISSION_DENIED:
          errorMsg = 'Location permission denied. Please enable location services.';
          break;
        case error.POSITION_UNAVAILABLE:
          errorMsg = 'Location information is unavailable.';
          break;
        case error.TIMEOUT:
          errorMsg = 'Location request timed out. Retrying...';
          // Try to get a single position update
          navigator.geolocation.getCurrentPosition(
            handleLocationUpdate, 
            handleLocationError, 
            options
          );
          break;
        default:
          errorMsg = 'An unknown error occurred getting your location.';
      }
      
      console.error(`Location error: ${errorMsg}`, error);
      setLocationError(errorMsg);
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
  };

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
          center: DEBUG_LOCATION || [-85.31, 35.05], // Default to Chattanooga
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
        });
        
        // Handle errors
        newMap.on('error', (e) => {
          console.error('Map error:', e);
        });
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
  }, [isUsingDebugLocation, startLocationWatch]);
  
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
      
      {/* Location error notification */}
      {locationError && (
        <div style={{
          position: 'absolute',
          top: '70px',
          left: '50%',
          transform: 'translateX(-50%)',
          backgroundColor: 'rgba(220, 38, 38, 0.9)',
          color: 'white',
          padding: '8px 16px',
          borderRadius: '4px',
          zIndex: 1000,
          maxWidth: '80%',
          textAlign: 'center',
          boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
        }}>
          {locationError}
        </div>
      )}
      
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
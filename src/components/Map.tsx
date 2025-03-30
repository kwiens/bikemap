'use client';

import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

// Initialize Mapbox access token
mapboxgl.accessToken = 'pk.eyJ1Ijoic3d1bGxlciIsImEiOiJjbThyZTVuMzEwMTZwMmpvdTRzM3JpMGlhIn0.CF5lzLSkkfO-c0qt6a168A ';

const DEFAULT_CENTER: [number, number] = [-85.31225, 35.04828];
const TEST_LOCATION: [number, number] = [-85.31225, 35.04828];

export default function Map() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const locationMarker = useRef<mapboxgl.Marker | null>(null);
  const watchId = useRef<number | null>(null);
  const retryTimeout = useRef<NodeJS.Timeout | null>(null);
  const [mapInitialized, setMapInitialized] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isTestMode] = useState(true);

  const createLocationMarker = () => {
    const el = document.createElement('div');
    el.className = 'current-location-marker';
    el.innerHTML = `
      <div class="location-dot"></div>
      <div class="location-pulse"></div>
    `;
    
    return new mapboxgl.Marker({
      element: el,
      anchor: 'center'
    });
  };

  const updateMarkerPosition = (mapInstance: mapboxgl.Map, coordinates: [number, number]) => {
    if (!locationMarker.current) {
      locationMarker.current = createLocationMarker();
      locationMarker.current.setLngLat(coordinates);
      locationMarker.current.addTo(mapInstance);
    } else {
      locationMarker.current.setLngLat(coordinates);
    }
  };

  const startLocationWatch = (mapInstance: mapboxgl.Map) => {
    if (isTestMode) {
      updateMarkerPosition(mapInstance, TEST_LOCATION);
      return;
    }

    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported by your browser.');
      return;
    }

    const options = {
      enableHighAccuracy: false,
      timeout: 10000,
      maximumAge: 60000
    };

    const handleLocationUpdate = (position: GeolocationPosition) => {
      const { longitude, latitude } = position.coords;
      setLocationError(null);
      setIsRetrying(false);
      updateMarkerPosition(mapInstance, [longitude, latitude]);
    };

    const handleLocationError = (error: GeolocationPositionError) => {
      let errorMessage = '';
      switch (error.code) {
        case error.PERMISSION_DENIED:
          errorMessage = 'Please enable location services in your browser settings to use this feature.';
          break;
        case error.POSITION_UNAVAILABLE:
          errorMessage = 'Unable to determine your location. Please check your device\'s GPS or network connection.';
          break;
        case error.TIMEOUT:
          if (!isRetrying) {
            setIsRetrying(true);
            errorMessage = 'Location request timed out. Retrying...';
            if (retryTimeout.current) {
              clearTimeout(retryTimeout.current);
            }
            retryTimeout.current = setTimeout(() => {
              navigator.geolocation.getCurrentPosition(handleLocationUpdate, handleLocationError, options);
            }, 2000);
          }
          break;
        default:
          errorMessage = 'An error occurred while getting your location.';
          break;
      }
      setLocationError(errorMessage);
    };

    watchId.current = navigator.geolocation.watchPosition(
      handleLocationUpdate,
      handleLocationError,
      options
    );
  };

  useEffect(() => {
    if (!mapContainer.current || map.current || mapInitialized) return;

    try {
      console.log('Initializing map');
      const mapInstance = new mapboxgl.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/swuller/cm8re9zyp004q01qkek8pdrsk', // Restore original custom style
        center: TEST_LOCATION, 
        zoom: 14.89,
        pitch: -22.4, // Restore original pitch
        bearing: 11,  // Restore original bearing
        antialias: true,
        transformRequest: (url, resourceType) => {
          if (resourceType === 'Model') {
            return {
              url: url,
              headers: {
                'Access-Control-Allow-Origin': '*'
              }
            };
          }
          return { url };
        }
      });

      mapInstance.on('load', () => {
        map.current = mapInstance;
        
        // Add marker immediately after map loads
        const marker = createLocationMarker();
        marker.setLngLat(TEST_LOCATION);
        marker.addTo(mapInstance);
        locationMarker.current = marker;
        
        // Center map on test location
        mapInstance.flyTo({
          center: TEST_LOCATION,
          zoom: 14.89,
          duration: 0
        });
        
        setMapInitialized(true);
      });

      mapInstance.on('error', (e: mapboxgl.ErrorEvent) => {
        console.error('Mapbox error:', e);
      });

    } catch (error) {
      console.error('Error initializing map:', error);
      setLocationError('Failed to initialize the map. Please refresh the page.');
    }

    return () => {
      if (watchId.current !== null) {
        navigator.geolocation.clearWatch(watchId.current);
      }
      if (retryTimeout.current !== null) {
        clearTimeout(retryTimeout.current);
      }
      if (map.current) {
        map.current.remove();
        map.current = null;
        setMapInitialized(false);
      }
    };
  }, []);

  useEffect(() => {
    if (map.current) {
      startLocationWatch(map.current);
    }
  }, [isTestMode]);

  return (
    <div className="map-wrapper">
      <div 
        ref={mapContainer} 
        className="map-container"
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
      />
      
      {/* Map overlays */}
      {locationError && (
        <div className="map-notification">
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg shadow-lg">
            <p className="text-sm">{locationError}</p>
          </div>
        </div>
      )}

      {/* Additional overlays can be added here */}
      <div className="map-overlay absolute top-4 right-4">
        {/* Future controls can go here */}
      </div>
    </div>
  );
} 
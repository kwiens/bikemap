'use client';

import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

// Initialize Mapbox access token
mapboxgl.accessToken = 'pk.eyJ1Ijoic3d1bGxlciIsImEiOiJjbThyZTVuMzEwMTZwMmpvdTRzM3JpMGlhIn0.CF5lzLSkkfO-c0qt6a168A ';

export default function Map() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const locationMarker = useRef<mapboxgl.Marker | null>(null);
  const watchId = useRef<number | null>(null);
  const [mapInitialized, setMapInitialized] = useState(false);

  useEffect(() => {
    console.log('Component mounted');
    
    // Only initialize the map if it hasn't been initialized yet
    if (mapContainer.current && !map.current && !mapInitialized) {
      console.log('Initializing map');
      
      try {
        const mapInstance = new mapboxgl.Map({
          container: mapContainer.current,
          style: 'mapbox://styles/swuller/cm8re9zyp004q01qkek8pdrsk',
          center: [-85.31225, 35.04828],
          zoom: 14.89,
          pitch: -22.4,
          bearing: 11,
          antialias: true
        });

        map.current = mapInstance;

        mapInstance.on('load', () => {
          console.log('Map loaded successfully');
          
          // Request user's location with battery-efficient options
          if (navigator.geolocation) {
            const options = {
              enableHighAccuracy: false, // Use low accuracy for better battery life
              timeout: 10000,           // Increased timeout to 10 seconds
              maximumAge: 60000         // Accept cached positions up to 1 minute old
            };

            // Function to handle location updates
            const handleLocationUpdate = (position: GeolocationPosition) => {
              const { longitude, latitude } = position.coords;
              
              // Create marker only when we have valid coordinates
              if (!locationMarker.current) {
                locationMarker.current = new mapboxgl.Marker({
                  color: '#007AFF',
                  scale: 0.8
                })
                  .setLngLat([longitude, latitude])
                  .addTo(mapInstance);
              } else {
                locationMarker.current.setLngLat([longitude, latitude]);
              }
            };

            // Function to handle location errors
            const handleLocationError = (error: GeolocationPositionError) => {
              switch (error.code) {
                case error.PERMISSION_DENIED:
                  console.error('Location permission denied. Please enable location services in your browser settings.');
                  break;
                case error.POSITION_UNAVAILABLE:
                  console.error('Location information is unavailable. Please check your device\'s location settings.');
                  break;
                case error.TIMEOUT:
                  console.warn('Location request timed out. Retrying...');
                  // Try to get a single position update
                  navigator.geolocation.getCurrentPosition(handleLocationUpdate, handleLocationError, options);
                  break;
                default:
                  console.error('An unknown error occurred while getting location:', error.message);
                  break;
              }
            };

            // Start watching position
            watchId.current = navigator.geolocation.watchPosition(
              handleLocationUpdate,
              handleLocationError,
              options
            );
          } else {
            console.error('Geolocation is not supported by your browser');
          }
          
          setMapInitialized(true);
        });

        mapInstance.on('error', (e: mapboxgl.ErrorEvent) => {
          console.error('Mapbox error:', e);
        });

      } catch (error) {
        console.error('Error initializing map:', error);
      }
    }

    // Cleanup function
    return () => {
      console.log('Cleanup called, map exists:', !!map.current);
      if (watchId.current !== null) {
        navigator.geolocation.clearWatch(watchId.current);
      }
      if (map.current) {
        map.current.remove();
        map.current = null;
        setMapInitialized(false);
      }
    };
  }, []); // Empty dependency array to run only once

  return (
    <div 
      ref={mapContainer} 
      className="w-full h-full absolute inset-0"
      style={{ 
        backgroundColor: '#f0f0f0',
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: 0,
        right: 0
      }}
    />
  );
} 
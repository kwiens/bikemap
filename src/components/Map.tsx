'use client';

import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

// Initialize Mapbox access token
mapboxgl.accessToken = 'pk.eyJ1Ijoia3dpZW5zIiwiYSI6ImNpa3NyenF0MjAwMDF2b20zbTR3aHN2ZGMifQ.6N8iaMsSQHZZsr8S46Pdbw';

export default function Map() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [mapInitialized, setMapInitialized] = useState(false);

  useEffect(() => {
    console.log('Component mounted');
    
    // Only initialize the map if it hasn't been initialized yet
    if (mapContainer.current && !map.current && !mapInitialized) {
      console.log('Initializing map');
      
      try {
        const mapInstance = new mapboxgl.Map({
          container: mapContainer.current,
          style: 'mapbox://styles/kwiens/cm6au0n48006h01s28k1p0faz',
          center: [-85.31225, 35.04828],
          zoom: 14.89,
          pitch: -22.4,
          bearing: 11,
          antialias: true
        });

        map.current = mapInstance;

        mapInstance.on('load', () => {
          console.log('Map loaded successfully');
          setMapInitialized(true);
        });

        mapInstance.on('error', (e) => {
          console.error('Mapbox error:', e);
        });

      } catch (error) {
        console.error('Error initializing map:', error);
      }
    }

    // Cleanup function
    return () => {
      console.log('Cleanup called, map exists:', !!map.current);
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
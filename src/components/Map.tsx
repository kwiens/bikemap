'use client';

import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

// Initialize Mapbox access token
mapboxgl.accessToken = 'pk.eyJ1Ijoic3d1bGxlciIsImEiOiJjbThyZTVuMzEwMTZwMmpvdTRzM3JpMGlhIn0.CF5lzLSkkfO-c0qt6a168A ';

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
          
          // Add bike lanes layer
          mapInstance.addLayer({
            'id': 'bike-lanes',
            'type': 'line',
            'source': {
              'type': 'vector',
              'url': 'mapbox://mapbox.mapbox-streets-v8'
            },
            'source-layer': 'transportation',
            'filter': ['==', ['get', 'class'], 'bike'],
            'layout': {
              'line-join': 'round',
              'line-cap': 'round'
            },
            'paint': {
              'line-color': '#007cbf',
              'line-width': 3,
              'line-opacity': 0.8
            }
          });

          // Add bike parking layer
          mapInstance.addLayer({
            'id': 'bike-parking',
            'type': 'symbol',
            'source': {
              'type': 'vector',
              'url': 'mapbox://mapbox.mapbox-streets-v8'
            },
            'source-layer': 'poi_label',
            'filter': ['==', ['get', 'class'], 'bicycle_parking'],
            'layout': {
              'text-field': ['get', 'name'],
              'text-size': 12,
              'icon-image': 'bicycle',
              'icon-size': 1
            },
            'paint': {
              'text-color': '#007cbf',
              'icon-color': '#007cbf'
            }
          });

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
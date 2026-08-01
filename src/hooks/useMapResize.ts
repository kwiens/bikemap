import { useEffect } from 'react';
import type mapboxgl from 'mapbox-gl';
import { MAP_EVENTS } from '@/events';

interface UseMapResizeOptions {
  map: React.MutableRefObject<mapboxgl.Map | null>;
}

export function useMapResize({ map }: UseMapResizeOptions) {
  useEffect(() => {
    const handleResize = () => {
      if (map.current) {
        map.current.resize();
      }
    };

    const handleSidebarToggle = () => {
      // Delay to wait for sidebar transition
      setTimeout(() => {
        if (map.current) {
          map.current.resize();
        }
      }, 300);
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener(MAP_EVENTS.SIDEBAR_TOGGLE, handleSidebarToggle);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener(
        MAP_EVENTS.SIDEBAR_TOGGLE,
        handleSidebarToggle,
      );
    };
  }, [map]);
}

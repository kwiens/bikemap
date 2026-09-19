import { useEffect } from 'react';
import type mapboxgl from 'mapbox-gl';
import { MAP_EVENTS } from '@/events';

interface UseMapResizeOptions {
  map: React.MutableRefObject<mapboxgl.Map | null>;
}

export function useMapResize({ map }: UseMapResizeOptions) {
  useEffect(() => {
    let sidebarResizeTimer: ReturnType<typeof setTimeout> | null = null;

    const handleResize = () => {
      if (map.current) {
        map.current.resize();
      }
    };

    const handleSidebarToggle = () => {
      // Delay to wait for sidebar transition
      if (sidebarResizeTimer) clearTimeout(sidebarResizeTimer);
      sidebarResizeTimer = setTimeout(() => {
        if (map.current) {
          map.current.resize();
        }
      }, 300);
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener(MAP_EVENTS.SIDEBAR_TOGGLE, handleSidebarToggle);

    return () => {
      if (sidebarResizeTimer) clearTimeout(sidebarResizeTimer);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener(
        MAP_EVENTS.SIDEBAR_TOGGLE,
        handleSidebarToggle,
      );
    };
  }, [map]);
}

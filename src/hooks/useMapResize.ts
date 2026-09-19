import { useEffect } from 'react';
import type mapboxgl from 'mapbox-gl';
import { MAP_EVENTS } from '@/events';

interface UseMapResizeOptions {
  map: React.MutableRefObject<mapboxgl.Map | null>;
}

export function syncMapPixelRatio(map: mapboxgl.Map): boolean {
  if (!map.painter || !map.transform || typeof map.getCanvas !== 'function') {
    return false;
  }

  const pixelRatio = window.devicePixelRatio || 1;
  const { width, height } = map.transform;
  const canvas = map.getCanvas();
  const expectedWidth = Math.floor(pixelRatio * Math.ceil(width));
  const expectedHeight = Math.floor(pixelRatio * Math.ceil(height));

  if (canvas.width === expectedWidth && canvas.height === expectedHeight) {
    return false;
  }

  // Mapbox's public resize() exits early when the CSS dimensions are unchanged,
  // even if the device-pixel ratio changed. Brave's fingerprinting protection
  // can make that happen just after initialization, leaving the renderer and
  // interaction transform out of sync. Run the same internal resize sequence
  // Mapbox uses when its dimensions do change.
  map._resizeCanvas(width, height);
  map.transform.resize(width, height);
  map.painter.resize(Math.ceil(width), Math.ceil(height));
  map.triggerRepaint();

  return true;
}

export function useMapResize({ map }: UseMapResizeOptions) {
  useEffect(() => {
    const resizeMap = () => {
      if (!map.current) return;

      map.current.resize();
      syncMapPixelRatio(map.current);
    };

    const handleResize = () => {
      resizeMap();
    };

    const handleSidebarToggle = () => {
      // Delay to wait for sidebar transition
      setTimeout(() => {
        resizeMap();
      }, 300);
    };

    let pixelRatioQuery: MediaQueryList | null = null;

    const handlePixelRatioChange = () => {
      resizeMap();
      watchPixelRatio();
    };

    const watchPixelRatio = () => {
      pixelRatioQuery?.removeEventListener('change', handlePixelRatioChange);

      if (typeof window.matchMedia !== 'function') return;

      pixelRatioQuery = window.matchMedia(
        `(resolution: ${window.devicePixelRatio || 1}dppx)`,
      );
      pixelRatioQuery.addEventListener('change', handlePixelRatioChange);
    };

    watchPixelRatio();

    // The map is initialized by a later effect in Map.tsx. Check again on the
    // next frame so a DPR change during construction cannot be missed.
    const initialFrame = window.requestAnimationFrame(resizeMap);

    window.addEventListener('resize', handleResize);
    window.addEventListener('focus', handleResize);
    window.addEventListener('pageshow', handleResize);
    window.visualViewport?.addEventListener('resize', handleResize);
    window.addEventListener(MAP_EVENTS.SIDEBAR_TOGGLE, handleSidebarToggle);

    return () => {
      window.cancelAnimationFrame(initialFrame);
      pixelRatioQuery?.removeEventListener('change', handlePixelRatioChange);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('focus', handleResize);
      window.removeEventListener('pageshow', handleResize);
      window.visualViewport?.removeEventListener('resize', handleResize);
      window.removeEventListener(
        MAP_EVENTS.SIDEBAR_TOGGLE,
        handleSidebarToggle,
      );
    };
  }, [map]);
}

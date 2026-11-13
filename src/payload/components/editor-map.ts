import { useEffect, useRef, type RefObject } from 'react';
import mapboxgl from 'mapbox-gl';
import { mapConfig } from '@/config/map.config';

const STYLES = {
  satellite: 'mapbox://styles/mapbox/satellite-streets-v12',
  streets: 'mapbox://styles/mapbox/outdoors-v12',
} as const;

export type EditorBasemap = keyof typeof STYLES;

/** Both editors restore their own layers on style.load. */
export function createEditorMap(
  container: HTMLElement,
  view: Pick<
    mapboxgl.MapOptions,
    'bounds' | 'center' | 'fitBoundsOptions' | 'zoom'
  >,
  boxZoom = true,
): mapboxgl.Map {
  mapboxgl.accessToken = mapConfig.mapbox.accessToken;
  const map = new mapboxgl.Map({
    ...view,
    boxZoom,
    container,
    // Both basemaps default to globe, which reorders draped layers at low zoom.
    // A fixed projection keeps editor overlays in the same draw order.
    projection: 'mercator',
    style: STYLES.streets,
  });
  map.addControl(new mapboxgl.NavigationControl(), 'top-right');
  return map;
}

export function useEditorBasemap(
  map: RefObject<mapboxgl.Map | null>,
  basemap: EditorBasemap,
  beforeSwitch?: () => void,
): void {
  const applied = useRef<{ map: mapboxgl.Map; basemap: EditorBasemap } | null>(
    null,
  );
  useEffect(() => {
    const current = map.current;
    if (!current) return;
    const previous =
      applied.current?.map === current ? applied.current.basemap : 'streets';
    applied.current = { map: current, basemap };
    if (previous === basemap) return;

    beforeSwitch?.();
    // A style diff can remove runtime layers without firing style.load. Load
    // a fresh style so both editors rebuild their overlays above the basemap.
    current.setStyle(STYLES[basemap], {
      diff: false,
      // Mapbox's types require these values even when using its defaults.
      localFontFamily: null,
      localIdeographFontFamily: 'sans-serif',
    });
  }, [basemap, beforeSwitch, map]);
}

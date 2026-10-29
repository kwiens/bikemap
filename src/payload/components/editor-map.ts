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
    style: STYLES.streets,
  });
  map.addControl(new mapboxgl.NavigationControl(), 'top-right');
  return map;
}

export function useEditorBasemap(
  map: RefObject<mapboxgl.Map | null>,
  basemap: EditorBasemap,
): void {
  const previous = useRef<EditorBasemap>('streets');
  useEffect(() => {
    if (!map.current || previous.current === basemap) return;
    previous.current = basemap;
    map.current.setStyle(STYLES[basemap]);
  }, [basemap, map]);
}

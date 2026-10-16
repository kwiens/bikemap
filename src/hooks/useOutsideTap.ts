import { useEffect, useRef, type RefObject } from 'react';
import { isMobileViewport } from './useLayout';

/**
 * Call `onOutsideTap` when a pointer goes down outside every element in
 * `insideRefs`, on a phone-width viewport only. Both side panels use this to
 * dismiss themselves: on a phone they overlay the map, so a tap on the map is
 * a request to see the map.
 *
 * Both callbacks are read through refs at tap time (the pattern `useMapEvent`
 * uses), so callers may pass plain closures over props or state and the
 * listener is still attached once per mount. The refs themselves are stable
 * for the component's lifetime.
 */
export function useOutsideTap(
  insideRefs: RefObject<HTMLElement | null>[],
  enabled: () => boolean,
  onOutsideTap: () => void,
): void {
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const onOutsideTapRef = useRef(onOutsideTap);
  onOutsideTapRef.current = onOutsideTap;
  const insideRefsRef = useRef(insideRefs);
  insideRefsRef.current = insideRefs;

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!isMobileViewport()) return;
      if (!enabledRef.current()) return;
      const target = event.target as Node;
      if (insideRefsRef.current.some((ref) => ref.current?.contains(target))) {
        return;
      }
      onOutsideTapRef.current();
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, []);
}

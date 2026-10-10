import { useEffect, type RefObject } from 'react';
import { isMobileViewport } from './useLayout';

/**
 * Call `onOutsideTap` when a pointer goes down outside every element in
 * `insideRefs`, on a phone-width viewport only. Both side panels use this to
 * dismiss themselves: on a phone they overlay the map, so a tap on the map is
 * a request to see the map.
 *
 * `enabled` is read at tap time, so the listener is attached once per mount.
 */
export function useOutsideTap(
  insideRefs: RefObject<HTMLElement | null>[],
  enabled: () => boolean,
  onOutsideTap: () => void,
): void {
  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!isMobileViewport()) return;
      if (!enabled()) return;
      const target = event.target as Node;
      if (insideRefs.some((ref) => ref.current?.contains(target))) return;
      onOutsideTap();
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
    // The refs are stable for the component's lifetime and the callbacks are
    // read when a tap happens, so there is nothing to re-run this for.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

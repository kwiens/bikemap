import { useEffect, useRef } from 'react';
import { type MapEventDetails, type MapEventName, onMapEvent } from '@/events';

/**
 * Subscribe a component to a map event for its lifetime.
 *
 * The handler is read through a ref, so callers pass a plain closure and the
 * subscription is made once — no `useCallback`, and no re-registering (with
 * the attendant missed-event gap) when the handler's dependencies change.
 */
export function useMapEvent<K extends MapEventName>(
  name: K,
  handler: (detail: MapEventDetails[K]) => void,
): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(
    () => onMapEvent(name, (detail) => handlerRef.current(detail)),
    [name],
  );
}

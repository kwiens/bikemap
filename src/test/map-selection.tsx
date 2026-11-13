import { useEffect, type ReactNode } from 'react';
import { act } from '@testing-library/react';
import {
  MapSelectionProvider,
  useMapSelectionStore,
} from '@/components/map-selection';

export function mapSelectionHarness() {
  let store: ReturnType<typeof useMapSelectionStore>;

  function CaptureStore() {
    const value = useMapSelectionStore();
    useEffect(() => {
      store = value;
    }, [value]);
    return null;
  }

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <MapSelectionProvider>
        <CaptureStore />
        {children}
      </MapSelectionProvider>
    );
  }

  return {
    Wrapper,
    get: () => store.get(),
    select(selection: Parameters<typeof store.select>[0]) {
      act(() => store.select(selection));
    },
    selectRide: (id: string) => store.selectRide(id),
    selectOsmTrail: (load: Parameters<typeof store.selectOsmTrail>[1]) =>
      store.selectOsmTrail([], load),
  };
}

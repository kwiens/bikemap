'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { MAP_EVENTS } from '@/events';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTimes, faLayerGroup } from '@fortawesome/free-solid-svg-icons';

import {
  BikeRoutes,
  MountainBikeTrails,
  MapLayers,
  AttractionsList,
  BikeResourcesList,
  BikeRentalList,
  InformationSection,
  Footer,
  type LocationProps,
} from './sidebar';
import { getRideStyle } from './WelcomeModal';
import { cn } from '@/lib/utils';

// Main provider component
export function MapLegendProvider({ children }: { children: React.ReactNode }) {
  // Track state in this parent component
  const [isOpen, setIsOpen] = useState(true);
  const [selectedRoute, setSelectedRoute] = useState<string | null>(null);
  const [selectedTrail, setSelectedTrail] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<'routes' | 'trails'>(() =>
    getRideStyle() === 'mountain' ? 'trails' : 'routes',
  );
  // Add state for map layers
  const [showAttractions, setShowAttractions] = useState(false);
  const [showBikeResources, setShowBikeResources] = useState(false);
  const [showBikeRentals, setShowBikeRentals] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const toggleButtonRef = useRef<HTMLButtonElement>(null);

  const isOpenRef = useRef(isOpen);
  isOpenRef.current = isOpen;

  const toggle = useCallback(() => {
    const next = !isOpenRef.current;
    setIsOpen(next);
    window.dispatchEvent(
      new CustomEvent(MAP_EVENTS.SIDEBAR_TOGGLE, {
        detail: { isOpen: next },
      }),
    );
  }, []);

  // Handle clicks/taps outside the sidebar (mobile only)
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (window.innerWidth > 768) return;
      if (!isOpen) return;
      if (toggleButtonRef.current?.contains(event.target as Node)) return;
      if (sidebarRef.current?.contains(event.target as Node)) return;

      toggle();
    };

    // Use capture phase so we see the event before it reaches sidebar children
    document.addEventListener('pointerdown', handleClickOutside);
    return () => {
      document.removeEventListener('pointerdown', handleClickOutside);
    };
  }, [isOpen, toggle]);

  // Listen for route-select events from the map (when user clicks on a route in the map)
  useEffect(() => {
    const handleMapRouteSelect = (event: Event) => {
      const customEvent = event as CustomEvent<{ routeId: string }>;
      const { routeId } = customEvent.detail;
      // Only update state, don't dispatch another event (map already handles the visual update)
      setSelectedRoute(routeId);
      setSelectedTrail(null);
    };

    window.addEventListener(MAP_EVENTS.ROUTE_SELECT, handleMapRouteSelect);
    return () => {
      window.removeEventListener(MAP_EVENTS.ROUTE_SELECT, handleMapRouteSelect);
    };
  }, []);

  // Listen for trail-select events from the map (when user clicks on a mountain bike trail)
  useEffect(() => {
    const handleMapTrailSelect = (event: Event) => {
      const customEvent = event as CustomEvent<{ trailName: string }>;
      const { trailName } = customEvent.detail;
      setSelectedTrail(trailName);
      setSelectedRoute(null);
      setActiveSection('trails');
    };

    window.addEventListener(MAP_EVENTS.TRAIL_SELECT, handleMapTrailSelect);
    return () => {
      window.removeEventListener(MAP_EVENTS.TRAIL_SELECT, handleMapTrailSelect);
    };
  }, []);

  // Listen for ride style chosen from welcome modal
  useEffect(() => {
    const handler = (e: Event) => {
      const { style } = (e as CustomEvent).detail;
      setActiveSection(style === 'mountain' ? 'trails' : 'routes');
    };

    window.addEventListener(MAP_EVENTS.RIDE_STYLE_CHOSEN, handler);
    return () =>
      window.removeEventListener(MAP_EVENTS.RIDE_STYLE_CHOSEN, handler);
  }, []);

  // Function to handle route selection
  const handleRouteSelect = useCallback(
    (routeId: string) => {
      setSelectedRoute(routeId);
      setSelectedTrail(null);

      // Dispatch event for map to update route opacity
      window.dispatchEvent(
        new CustomEvent(MAP_EVENTS.ROUTE_SELECT, {
          detail: { routeId },
        }),
      );
      window.dispatchEvent(new CustomEvent(MAP_EVENTS.TRAIL_DESELECT));

      // Close sidebar on mobile after selection
      if (window.innerWidth <= 768 && isOpen) {
        toggle();
      }
    },
    [isOpen, toggle],
  );

  // Function to handle trail selection
  const handleTrailSelect = useCallback(
    (trailName: string) => {
      setSelectedTrail(trailName);
      setSelectedRoute(null);

      window.dispatchEvent(
        new CustomEvent(MAP_EVENTS.TRAIL_SELECT, {
          detail: { trailName },
        }),
      );
      window.dispatchEvent(new CustomEvent(MAP_EVENTS.ROUTE_DESELECT));

      if (window.innerWidth <= 768 && isOpen) {
        toggle();
      }
    },
    [isOpen, toggle],
  );

  // Function to handle area (rec area heading) selection
  const handleAreaSelect = useCallback((areaName: string) => {
    setSelectedTrail(null);
    setSelectedRoute(null);

    // Deselect first — trail-deselect resets mountain bike opacity,
    // so it must fire before area-select sets the highlight
    window.dispatchEvent(new CustomEvent(MAP_EVENTS.ROUTE_DESELECT));
    window.dispatchEvent(new CustomEvent(MAP_EVENTS.TRAIL_DESELECT));
    window.dispatchEvent(
      new CustomEvent(MAP_EVENTS.AREA_SELECT, {
        detail: { areaName },
      }),
    );
  }, []);

  // Helper to toggle a layer with radio-button behavior:
  // turning one layer ON turns the other two OFF
  const toggleLayer = useCallback(
    (layer: 'attractions' | 'bikeResources' | 'bikeRentals') => {
      const stateMap = {
        attractions: showAttractions,
        bikeResources: showBikeResources,
        bikeRentals: showBikeRentals,
      };
      const setterMap = {
        attractions: setShowAttractions,
        bikeResources: setShowBikeResources,
        bikeRentals: setShowBikeRentals,
      };

      const turningOn = !stateMap[layer];

      // Update state and dispatch events for all layers
      for (const key of Object.keys(stateMap) as Array<keyof typeof stateMap>) {
        const newValue = key === layer ? turningOn : false;
        if (stateMap[key] !== newValue) {
          setterMap[key](newValue);
          window.dispatchEvent(
            new CustomEvent(MAP_EVENTS.LAYER_TOGGLE, {
              detail: { layer: key, visible: newValue },
            }),
          );
        }
      }
    },
    [showAttractions, showBikeResources, showBikeRentals],
  );

  const toggleAttractionLayer = useCallback(
    () => toggleLayer('attractions'),
    [toggleLayer],
  );

  const toggleBikeResourcesLayer = useCallback(
    () => toggleLayer('bikeResources'),
    [toggleLayer],
  );

  const toggleBikeRentalsLayer = useCallback(
    () => toggleLayer('bikeRentals'),
    [toggleLayer],
  );

  // Function to center map on a specific location
  const centerOnLocation = useCallback(
    (location: LocationProps) => {
      // Dispatch event for map to center and show pin
      window.dispatchEvent(
        new CustomEvent(MAP_EVENTS.CENTER_LOCATION, {
          detail: {
            location: location,
          },
        }),
      );

      // Close sidebar on mobile after selection
      if (window.innerWidth <= 768 && isOpen) {
        toggle();
      }
    },
    [isOpen, toggle],
  );

  // Listen for route-deselect event
  useEffect(() => {
    const handleRouteDeselect = () => {
      setSelectedRoute(null);
    };

    window.addEventListener(MAP_EVENTS.ROUTE_DESELECT, handleRouteDeselect);

    return () => {
      window.removeEventListener(
        MAP_EVENTS.ROUTE_DESELECT,
        handleRouteDeselect,
      );
    };
  }, []);

  // Listen for trail-deselect event
  useEffect(() => {
    const handleTrailDeselect = () => {
      setSelectedTrail(null);
    };

    window.addEventListener(MAP_EVENTS.TRAIL_DESELECT, handleTrailDeselect);

    return () => {
      window.removeEventListener(
        MAP_EVENTS.TRAIL_DESELECT,
        handleTrailDeselect,
      );
    };
  }, []);

  // Close when rides panel opens
  useEffect(() => {
    const handler = (e: Event) => {
      const { isOpen: panelOpen } = (e as CustomEvent).detail;
      if (panelOpen && isOpenRef.current) {
        setIsOpen(false);
      }
    };
    window.addEventListener(MAP_EVENTS.RIDES_PANEL_TOGGLE, handler);
    return () =>
      window.removeEventListener(MAP_EVENTS.RIDES_PANEL_TOGGLE, handler);
  }, []);

  return (
    <>
      {children}

      {/* Toggle button */}
      <div className="fixed top-4 left-4 z-[1000]">
        <button
          ref={toggleButtonRef}
          onClick={toggle}
          className="bg-white rounded-full p-3 shadow-md cursor-pointer flex items-center justify-center border-none transition-colors duration-150 hover:bg-gray-50 active:bg-[#e5e5e5]"
          type="button"
        >
          <FontAwesomeIcon
            icon={isOpen ? faTimes : faLayerGroup}
            className="w-5 h-5 text-gray-700"
          />
        </button>
      </div>

      {/* Sidebar - always in DOM but transforms off-screen when closed */}
      <div
        ref={sidebarRef}
        className={cn(
          'fixed top-0 left-0 h-full w-[280px] bg-white shadow-[2px_0_5px_rgba(0,0,0,0.1)] z-[999] overflow-hidden transition-transform duration-300 ease-in-out max-md:w-full max-md:max-w-[320px]',
          isOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {/* Casual / MTB toggle in header */}
        <div className="flex justify-center items-center py-[17px] px-4 pl-[68px] pb-3 border-b border-gray-200 bg-gray-50">
          <div className="flex bg-gray-100 rounded-full p-1 w-full border border-gray-200">
            <button
              type="button"
              className={cn(
                'flex-1 py-1.5 px-4 text-sm font-medium rounded-full transition-colors',
                activeSection === 'routes'
                  ? 'bg-white text-gray-800 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700',
              )}
              onClick={() => setActiveSection('routes')}
            >
              Casual
            </button>
            <button
              type="button"
              className={cn(
                'flex-1 py-1.5 px-4 text-sm font-medium rounded-full transition-colors',
                activeSection === 'trails'
                  ? 'bg-white text-gray-800 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700',
              )}
              onClick={() => setActiveSection('trails')}
            >
              MTB
            </button>
          </div>
        </div>

        <div className="overflow-y-auto h-[calc(100%-79px)]">
          <div className="px-4 pb-4 pt-2">
            {activeSection === 'routes' && (
              <>
                <BikeRoutes
                  selectedRoute={selectedRoute}
                  onRouteSelect={handleRouteSelect}
                />

                <MapLayers
                  showAttractions={showAttractions}
                  showBikeResources={showBikeResources}
                  showBikeRentals={showBikeRentals}
                  onToggleAttractions={toggleAttractionLayer}
                  onToggleBikeResources={toggleBikeResourcesLayer}
                  onToggleBikeRentals={toggleBikeRentalsLayer}
                />

                <AttractionsList
                  show={showAttractions}
                  onCenterLocation={centerOnLocation}
                />

                <BikeResourcesList
                  show={showBikeResources}
                  onCenterLocation={centerOnLocation}
                />

                <BikeRentalList
                  show={showBikeRentals}
                  onCenterLocation={centerOnLocation}
                />
              </>
            )}

            {activeSection === 'trails' && (
              <MountainBikeTrails
                selectedTrail={selectedTrail}
                onTrailSelect={handleTrailSelect}
                onAreaSelect={handleAreaSelect}
              />
            )}

            <InformationSection />
          </div>
        </div>

        <Footer />
      </div>
    </>
  );
}

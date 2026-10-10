'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { MAP_EVENTS, dispatchMapEvent } from '@/events';
import { useMapEvent } from '@/hooks/useMapEvent';
import {
  getLayout,
  isMobileViewport,
  setSidebarOpen,
  toggleSidebar,
  useLayout,
  useSeedLayout,
} from '@/hooks/useLayout';
import { useOutsideTap } from '@/hooks/useOutsideTap';
import { onMapReady } from '@/utils/map-ready';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faTimes,
  faLayerGroup,
  faMountain,
} from '@fortawesome/free-solid-svg-icons';

import {
  BikeRoutes,
  MountainBikeTrails,
  MapLayers,
  MapLayersSection,
  ToggleRow,
  BikeNetworkLayer,
  AttractionsList,
  BikeResourcesList,
  BikeRentalList,
  InformationSection,
  type LocationProps,
} from './sidebar';
import { getRideStyle } from './WelcomeModal';
import { getSetting, setSetting } from '@/utils/settings';
import { TOGGLE_BTN_CLASS, TOGGLE_ICON_CLASS } from './styles';
import { cn } from '@/lib/utils';
import { mapConfig } from '@/config/map.config';
import { siteConfig } from '@/config/site.config';
import { useEmbed } from '@/components/EmbedContext';
import type { EmbedLayer } from '@/utils/embed';
import { bikeNetworkUrl, bikeResources, mapFeatures } from '@/data/geo_data';
import { getBikeRoutes } from '@/data/route-source';
import { getMountainBikeTrails } from '@/data/trail-source';

// Main provider component
export function MapLegendProvider({ children }: { children: React.ReactNode }) {
  const hasRoutesSection =
    getBikeRoutes().length > 0 ||
    mapFeatures.length > 0 ||
    bikeResources.length > 0 ||
    Boolean(mapConfig.gbfs);
  const { isEmbed, options: embedOptions } = useEmbed();
  // Embeds never carry the settings cookie, so they take the host page's
  // option instead.
  useSeedLayout(() => ({
    sidebarOpen: isEmbed
      ? embedOptions.sidebarOpen
      : (getSetting('sidebarOpen') ?? true),
  }));
  const { sidebarOpen: isOpen } = useLayout();
  const [selectedRoute, setSelectedRoute] = useState<string | null>(null);
  const [selectedTrail, setSelectedTrail] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<'routes' | 'trails'>(
    () => {
      if (isEmbed) return 'routes';
      const saved = getSetting('activeTab');
      if (saved === 'routes' && hasRoutesSection) return saved;
      if (saved === 'trails') return saved;
      if (getRideStyle() === 'mountain') return 'trails';
      return hasRoutesSection ? 'routes' : 'trails';
    },
  );
  // Embed mode is Casual-only — no MTB tab, so tab switching is a no-op.
  const switchTab = (tab: 'routes' | 'trails') => {
    if (isEmbed) return;
    if (tab === 'routes' && !hasRoutesSection) return;
    setActiveSection(tab);
    setSetting('activeTab', tab);
  };
  // What section actually renders — embed mode always shows Casual/routes
  // regardless of activeSection (kept only so non-embed logic is untouched).
  const visibleSection = isEmbed ? 'routes' : activeSection;
  // Add state for map layers
  const [showAttractions, setShowAttractions] = useState(false);
  const [showBikeResources, setShowBikeResources] = useState(false);
  const [showBikeRentals, setShowBikeRentals] = useState(false);
  const [showOsmTrails, setShowOsmTrails] = useState(false);
  const [showBikeNetwork, setShowBikeNetwork] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const toggleButtonRef = useRef<HTMLButtonElement>(null);

  // Third-party frames drop the settings cookie anyway (no SameSite=None).
  const toggle = useCallback(
    () => toggleSidebar({ persist: !isEmbed }),
    [isEmbed],
  );

  // On a phone the sidebar overlays the map, so it gets out of the way after
  // a selection or a tap on the map. Neither is a preference worth saving.
  const closeOnMobile = useCallback(() => {
    if (isMobileViewport()) setSidebarOpen(false);
  }, []);
  useOutsideTap(
    [sidebarRef, toggleButtonRef],
    () => getLayout().sidebarOpen,
    closeOnMobile,
  );

  // Selections made on the map itself. Only state changes here — the map
  // already handled the visual update before dispatching.
  useMapEvent(MAP_EVENTS.ROUTE_SELECT, ({ routeId }) => {
    setSelectedRoute(routeId);
    setSelectedTrail(null);
  });
  useMapEvent(MAP_EVENTS.TRAIL_SELECT, ({ trailName }) => {
    setSelectedTrail(trailName);
    setSelectedRoute(null);
    setActiveSection('trails');
  });
  useMapEvent(MAP_EVENTS.ROUTE_DESELECT, () => setSelectedRoute(null));
  useMapEvent(MAP_EVENTS.TRAIL_DESELECT, () => setSelectedTrail(null));

  // Ride style chosen in the welcome modal picks the matching tab.
  useMapEvent(MAP_EVENTS.RIDE_STYLE_CHOSEN, ({ style }) => {
    switchTab(style === 'mountain' ? 'trails' : 'routes');
  });

  // Function to handle route selection
  const handleRouteSelect = useCallback(
    (routeId: string) => {
      setSelectedRoute(routeId);
      setSelectedTrail(null);

      // Dispatch event for map to update route opacity
      dispatchMapEvent(MAP_EVENTS.ROUTE_SELECT, { routeId });
      dispatchMapEvent(MAP_EVENTS.TRAIL_DESELECT);
      closeOnMobile();
    },
    [closeOnMobile],
  );

  // Function to handle trail selection
  const handleTrailSelect = useCallback(
    (trailName: string) => {
      setSelectedTrail(trailName);
      setSelectedRoute(null);

      dispatchMapEvent(MAP_EVENTS.TRAIL_SELECT, { trailName });
      dispatchMapEvent(MAP_EVENTS.ROUTE_DESELECT);
      closeOnMobile();
    },
    [closeOnMobile],
  );

  // Function to handle area (rec area heading) selection
  const handleAreaSelect = useCallback((areaName: string) => {
    setSelectedTrail(null);
    setSelectedRoute(null);

    // Deselect first — trail-deselect resets mountain bike opacity,
    // so it must fire before area-select sets the highlight
    dispatchMapEvent(MAP_EVENTS.ROUTE_DESELECT);
    dispatchMapEvent(MAP_EVENTS.TRAIL_DESELECT);
    dispatchMapEvent(MAP_EVENTS.AREA_SELECT, { areaName });
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

      // Update state and dispatch events for all layers. OFF events go out
      // before the ON so listeners never see two layers active at once.
      const keys = Object.keys(stateMap) as Array<keyof typeof stateMap>;
      const changed = keys.filter(
        (key) => stateMap[key] !== (key === layer ? turningOn : false),
      );
      const ordered = [
        ...changed.filter((key) => key !== layer),
        ...changed.filter((key) => key === layer),
      ];
      for (const key of ordered) {
        const newValue = key === layer ? turningOn : false;
        setterMap[key](newValue);
        dispatchMapEvent(MAP_EVENTS.LAYER_TOGGLE, {
          layer: key,
          visible: newValue,
        });
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

  // Nationwide OSM bike trails toggle independently of the marker layers
  // (it's a vector line layer, not part of the radio-button marker group).
  // Compute next, set, then dispatch — dispatching inside the setState updater
  // would double-fire under React StrictMode's double-invoked updaters.
  const toggleOsmTrailsLayer = useCallback(() => {
    const next = !showOsmTrails;
    setShowOsmTrails(next);
    dispatchMapEvent(MAP_EVENTS.LAYER_TOGGLE, {
      layer: 'osmTrails',
      visible: next,
    });
  }, [showOsmTrails]);

  // Classified bike-network overlay (Casual mode), independent of the markers.
  const toggleBikeNetworkLayer = useCallback(() => {
    const next = !showBikeNetwork;
    setShowBikeNetwork(next);
    dispatchMapEvent(MAP_EVENTS.LAYER_TOGGLE, {
      layer: 'bikeNetwork',
      visible: next,
    });
  }, [showBikeNetwork]);

  // Embed layer presets: turn on whatever layers the host page requested via
  // `?layers=...`, once, on mount. Sidebar `show*` state flips immediately;
  // the map only picks up LAYER_TOGGLE once it's ready.
  //
  // The sidebar is interactive from first paint but a Mapbox boot can take
  // seconds on a partner's page, so the deferred dispatch reads the CURRENT
  // state rather than replaying the URL: otherwise a layer the visitor
  // switched off while the map was still loading would switch itself back on,
  // leaving the sidebar and the map disagreeing.
  const presetLayersRef = useRef({
    attractions: false,
    bikeResources: false,
    bikeRentals: false,
    bikeNetwork: false,
  });
  presetLayersRef.current = {
    attractions: showAttractions,
    bikeResources: showBikeResources,
    bikeRentals: showBikeRentals,
    bikeNetwork: showBikeNetwork,
  };

  useEffect(() => {
    if (!isEmbed || embedOptions.layers.length === 0) return;

    const setterMap: Record<EmbedLayer, () => void> = {
      attractions: () => setShowAttractions(true),
      bikeResources: () => setShowBikeResources(true),
      bikeRentals: () => setShowBikeRentals(true),
      bikeNetwork: () => setShowBikeNetwork(true),
    };
    for (const layer of embedOptions.layers) {
      setterMap[layer]();
      // Seed the ref too: when the map is already ready, onMapReady dispatches
      // synchronously below — before React has re-rendered with the state we
      // just queued, so the ref would still read false.
      presetLayersRef.current[layer] = true;
    }

    const dispatchLayers = () => {
      for (const layer of embedOptions.layers) {
        const visible = presetLayersRef.current[layer];
        dispatchMapEvent(MAP_EVENTS.LAYER_TOGGLE, { layer, visible });
      }
    };

    return onMapReady(dispatchLayers);
    // Runs once on mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Function to center map on a specific location
  const centerOnLocation = useCallback(
    (location: LocationProps) => {
      // Dispatch event for map to center and show pin
      dispatchMapEvent(MAP_EVENTS.CENTER_LOCATION, { location });
      closeOnMobile();
    },
    [closeOnMobile],
  );

  return (
    <>
      {children}

      {/* Toggle button */}
      <div
        className={cn(
          'fixed left-4 top-[calc(1rem+env(safe-area-inset-top))]',
          isOpen ? 'z-[960]' : 'z-[900]',
        )}
      >
        <button
          ref={toggleButtonRef}
          onClick={toggle}
          className={TOGGLE_BTN_CLASS}
          type="button"
        >
          <FontAwesomeIcon
            icon={isOpen ? faTimes : faLayerGroup}
            className={TOGGLE_ICON_CLASS}
          />
        </button>
      </div>

      {/* Sidebar - always in DOM but transforms off-screen when closed */}
      <div
        ref={sidebarRef}
        className={cn(
          'fixed top-0 left-0 h-full w-[280px] bg-white shadow-[2px_0_5px_rgba(0,0,0,0.1)] z-[950] overflow-hidden transition-transform duration-300 ease-in-out flex flex-col max-md:w-full max-md:max-w-[320px]',
          isOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {isEmbed ? (
          /* Embed mode is Casual-only — a compact label instead of the pill */
          <div className="flex items-center py-[17px] px-4 pl-[68px] pb-3 border-b border-gray-200 bg-gray-50 pt-[calc(17px+env(safe-area-inset-top))]">
            <span className="text-sm font-medium text-gray-700">
              {siteConfig.name}
            </span>
          </div>
        ) : (
          /* Casual / MTB toggle in header */
          <div className="flex justify-center items-center py-[17px] px-4 pl-[68px] pb-3 border-b border-gray-200 bg-gray-50 pt-[calc(17px+env(safe-area-inset-top))]">
            <div className="flex bg-gray-100 rounded-full p-1 w-full border border-gray-200">
              {hasRoutesSection && (
                <button
                  type="button"
                  className={cn(
                    'flex-1 py-1.5 px-4 text-sm font-medium rounded-full transition-colors',
                    activeSection === 'routes'
                      ? 'bg-white text-gray-800 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700',
                  )}
                  onClick={() => switchTab('routes')}
                >
                  Casual
                </button>
              )}
              <button
                type="button"
                className={cn(
                  'flex-1 py-1.5 px-4 text-sm font-medium rounded-full transition-colors',
                  activeSection === 'trails'
                    ? 'bg-white text-gray-800 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700',
                )}
                onClick={() => switchTab('trails')}
              >
                MTB
              </button>
            </div>
          </div>
        )}

        <div className="overflow-y-auto flex-1 min-h-0">
          <div className="px-4 pb-4 pt-2">
            {visibleSection === 'routes' && (
              <>
                <BikeRoutes
                  selectedRoute={selectedRoute}
                  onRouteSelect={handleRouteSelect}
                />

                {bikeNetworkUrl && (
                  <BikeNetworkLayer
                    isActive={showBikeNetwork}
                    onToggle={toggleBikeNetworkLayer}
                  />
                )}

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

            {visibleSection === 'trails' && (
              <>
                <MapLayersSection>
                  <ToggleRow
                    icon={faMountain}
                    label="Nationwide trails"
                    isActive={showOsmTrails}
                    onToggle={toggleOsmTrailsLayer}
                  />
                </MapLayersSection>

                {getMountainBikeTrails().length > 0 && (
                  <MountainBikeTrails
                    selectedTrail={selectedTrail}
                    onTrailSelect={handleTrailSelect}
                    onAreaSelect={handleAreaSelect}
                  />
                )}
              </>
            )}

            {!isEmbed && <InformationSection />}
          </div>
        </div>
      </div>
    </>
  );
}

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTimes, faLayerGroup } from '@fortawesome/free-solid-svg-icons';
import './map-legend.css';

import {
  SidebarHeader,
  BikeRoutes,
  MapLayers,
  AttractionsList,
  BikeResourcesList,
  BikeRentalList,
  InformationSection,
  Footer,
  type LocationProps,
} from './sidebar';

// Main provider component
export function MapLegendProvider({ children }: { children: React.ReactNode }) {
  // Track state in this parent component
  const [isOpen, setIsOpen] = useState(true);
  const [selectedRoute, setSelectedRoute] = useState<string | null>(null);
  // Add state for map layers
  const [showAttractions, setShowAttractions] = useState(false);
  const [showBikeResources, setShowBikeResources] = useState(false);
  const [showBikeRentals, setShowBikeRentals] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const toggleButtonRef = useRef<HTMLButtonElement>(null);

  const toggle = useCallback(() => {
    setIsOpen(!isOpen);

    // Dispatch event for map resizing
    window.dispatchEvent(
      new CustomEvent('sidebar-toggle', {
        detail: { isOpen: !isOpen },
      }),
    );
  }, [isOpen]);

  // Handle clicks outside the sidebar
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // Only handle clicks on mobile (screen width <= 768px)
      if (window.innerWidth > 768) {
        return;
      }

      // Don't close if clicking the toggle button
      if (toggleButtonRef.current?.contains(event.target as Node)) {
        return;
      }

      // Don't close if clicking inside the sidebar
      if (sidebarRef.current?.contains(event.target as Node)) {
        return;
      }

      // Close the sidebar if clicking outside
      if (isOpen) {
        toggle();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, toggle]);

  // Listen for route-select events from the map (when user clicks on a route in the map)
  useEffect(() => {
    const handleMapRouteSelect = (event: Event) => {
      const customEvent = event as CustomEvent<{ routeId: string }>;
      const { routeId } = customEvent.detail;
      // Only update state, don't dispatch another event (map already handles the visual update)
      setSelectedRoute(routeId);
    };

    window.addEventListener('route-select', handleMapRouteSelect);
    return () => {
      window.removeEventListener('route-select', handleMapRouteSelect);
    };
  }, []);

  // Function to handle route selection
  const handleRouteSelect = useCallback(
    (routeId: string) => {
      setSelectedRoute(routeId);

      // Dispatch event for map to update route opacity
      window.dispatchEvent(
        new CustomEvent('route-select', {
          detail: { routeId },
        }),
      );

      // Close sidebar on mobile after selection
      if (window.innerWidth <= 768 && isOpen) {
        toggle();
      }
    },
    [isOpen, toggle],
  );

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
            new CustomEvent('layer-toggle', {
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
        new CustomEvent('center-location', {
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

    window.addEventListener('route-deselect', handleRouteDeselect);

    return () => {
      window.removeEventListener('route-deselect', handleRouteDeselect);
    };
  }, []);

  return (
    <>
      {children}

      {/* Toggle button */}
      <div className="toggle-button-container">
        <button
          ref={toggleButtonRef}
          onClick={toggle}
          className="toggle-button"
          type="button"
        >
          <FontAwesomeIcon
            icon={isOpen ? faTimes : faLayerGroup}
            className="toggle-button-icon"
          />
        </button>
      </div>

      {/* Sidebar - always in DOM but transforms off-screen when closed */}
      <div
        ref={sidebarRef}
        className={`sidebar-container ${isOpen ? 'sidebar-visible' : 'sidebar-hidden'}`}
      >
        <SidebarHeader />

        <div className="sidebar-content">
          <div className="sidebar-inner-content">
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

            <InformationSection />
          </div>
        </div>

        <Footer />
      </div>
    </>
  );
}

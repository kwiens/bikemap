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

  // Function to toggle attraction layer
  const toggleAttractionLayer = useCallback(() => {
    const newValue = !showAttractions;
    setShowAttractions(newValue);

    // Dispatch event for map to show or hide attractions
    window.dispatchEvent(
      new CustomEvent('layer-toggle', {
        detail: {
          layer: 'attractions',
          visible: newValue,
        },
      }),
    );
  }, [showAttractions]);

  // Function to toggle bike resources layer
  const toggleBikeResourcesLayer = useCallback(() => {
    const newValue = !showBikeResources;
    setShowBikeResources(newValue);

    // Dispatch event for map to show or hide bike resources
    window.dispatchEvent(
      new CustomEvent('layer-toggle', {
        detail: {
          layer: 'bikeResources',
          visible: newValue,
        },
      }),
    );
  }, [showBikeResources]);

  // Function to toggle bike rentals layer
  const toggleBikeRentalsLayer = useCallback(() => {
    const newValue = !showBikeRentals;
    setShowBikeRentals(newValue);

    // Dispatch event for map to show or hide bike rentals
    window.dispatchEvent(
      new CustomEvent('layer-toggle', {
        detail: {
          layer: 'bikeRentals',
          visible: newValue,
        },
      }),
    );
  }, [showBikeRentals]);

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

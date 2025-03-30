'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

import { 
  faMap, 
  faMapMarkerAlt, 
  faTimes,
  faLocationArrow,
  faBicycle,
  faLayerGroup
} from '@fortawesome/free-solid-svg-icons';
import { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { bikeRoutes, mapFeatures, bikeResources, localResources } from '@/data/geo_data';
import './map-legend.css';

// Define interfaces for various component props
interface ToggleSwitchProps {
  isActive: boolean;
  color?: string;
}

interface BikeRoutesProps {
  selectedRoute: string | null;
  onRouteSelect: (routeId: string) => void;
}

interface MapLayersProps {
  showAttractions: boolean;
  showBikeResources: boolean;
  onToggleAttractions: () => void;
  onToggleBikeResources: () => void;
}

interface LocationProps {
  latitude: number;
  longitude: number;
  name: string;
  description: string;
  icon: IconDefinition;
}

interface AttractionsListProps {
  show: boolean;
  onCenterLocation: (location: LocationProps) => void;
}

interface BikeResourcesListProps {
  show: boolean;
  onCenterLocation: (location: LocationProps) => void;
}

interface ExternalLinkProps {
  href: string;
  children: React.ReactNode;
}

// Toggle Switch Component
const ToggleSwitch: React.FC<ToggleSwitchProps> = ({ isActive }) => (
  <div className={`toggle-switch ${isActive ? 'toggle-switch-active' : 'toggle-switch-inactive'}`}>
    <div className={`toggle-switch-handle ${isActive ? 'toggle-switch-handle-active' : 'toggle-switch-handle-inactive'}`} />
  </div>
);

// Header Component
const SidebarHeader = () => (
  <div className="sidebar-header">
    <h2 className="sidebar-header-title">
      <FontAwesomeIcon icon={faMap} className="sidebar-header-icon" />
      <span>Chattanooga Bike Map</span>
    </h2>
  </div>
);

// BikeRoutes Component
const BikeRoutes: React.FC<BikeRoutesProps> = ({ selectedRoute, onRouteSelect }) => (
  <div className="section-container">
    <h3 className="section-title">
      Pick a Loop
    </h3>
    <div className="section-items">
      {bikeRoutes.map((route) => (
        <div 
          key={route.id} 
          onClick={() => onRouteSelect(route.id)}
          className={`route-item ${selectedRoute === route.id ? 'route-item-selected' : ''}`}
        >
          <div className="card-header">
            <div
              className="route-color-indicator"
              style={{ backgroundColor: route.color }}
            />
            <span className="route-name">{route.name}</span>
          </div>
          <div className="route-description">
            {route.description}
          </div>
        </div>
      ))}
    </div>
  </div>
);

// MapLayers Component
const MapLayers: React.FC<MapLayersProps> = ({ showAttractions, showBikeResources, onToggleAttractions, onToggleBikeResources }) => (
  <div className="section-container">
    <h3 className="section-title">
      Map Layers
    </h3>
    <div className="section-items">
      {/* Attractions Layer Toggle */}
      <div 
        onClick={onToggleAttractions}
        className="layer-toggle"
      >
        <div className="card-header">
          <FontAwesomeIcon 
            icon={faMapMarkerAlt} 
            className="layer-icon" 
          />
          <span className="layer-name">Attractions</span>
        </div>
        <ToggleSwitch isActive={showAttractions} />
      </div>

      {/* Bike Resources Layer Toggle */}
      <div 
        onClick={onToggleBikeResources}
        className="layer-toggle"
      >
        <div className="card-header">
          <FontAwesomeIcon 
            icon={faBicycle} 
            className="layer-icon" 
          />
          <span className="layer-name">Bike Resources</span>
        </div>
        <ToggleSwitch isActive={showBikeResources} />
      </div>
    </div>
  </div>
);

// AttractionsList Component
const AttractionsList: React.FC<AttractionsListProps> = ({ show, onCenterLocation }) => (
  <div className={`section-container ${!show ? 'hidden' : ''}`}>
    <h3 className="section-title">
      Attractions
    </h3>
    <div className="section-items">
      {mapFeatures.map((location) => (
        <div 
          key={location.name} 
          className="card"
          onClick={() => onCenterLocation(location)}
        >
          <div className="card-header">
            <div className="card-icon-container card-icon-blue">
              <FontAwesomeIcon 
                icon={location.icon} 
                className="card-icon icon-blue" 
              />
            </div>
            <span className="card-title">{location.name}</span>
          </div>
          <div className="card-description card-description-flex">
            <span className="description-text">{location.description}</span>
            <div className="location-arrow-container-blue">
              <FontAwesomeIcon 
                icon={faLocationArrow} 
                className="location-arrow-icon" 
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  </div>
);

// BikeResourcesList Component
const BikeResourcesList: React.FC<BikeResourcesListProps> = ({ show, onCenterLocation }) => (
  <div className={`section-container ${!show ? 'hidden' : ''}`}>
    <h3 className="section-title">
      Bike Resources
    </h3>
    <div className="section-items">
      {bikeResources.map((location) => (
        <div 
          key={location.name} 
          className="card card-green"
          onClick={() => onCenterLocation(location)}
        >
          <div className="card-header">
            <div className="card-icon-container card-icon-green">
              <FontAwesomeIcon 
                icon={location.icon} 
                className="card-icon icon-green" 
              />
            </div>
            <span className="card-title">{location.name}</span>
          </div>
          <div className="card-description card-description-flex">
            <span className="description-text">{location.description}</span>
            <div className="location-arrow-container-green">
              <FontAwesomeIcon 
                icon={faLocationArrow} 
                className="location-arrow-icon" 
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  </div>
);

// Link Component
const ExternalLink: React.FC<ExternalLinkProps> = ({ href, children }) => (
  <a 
    href={href}
    target="_blank" 
    rel="noopener noreferrer"
    className="external-link"
  >
    {children}
  </a>
);

// InformationSection Component
const InformationSection = () => (
  <div className="section-container">
    <h3 className="section-title">
      Information
    </h3>
    <div className="section-items">
      {localResources.map((resource) => (
        <div 
          key={resource.name}
          className="card"
        >
          <div className="card-header">
            <div 
              className="card-icon-container"
              data-color={resource.color}
            >
              <FontAwesomeIcon 
                icon={resource.icon} 
                className="card-icon"
                data-color={resource.color}
              />
            </div>
            <span className="card-title">{resource.name}</span>
          </div>
          <div className="card-description">
            {resource.description.includes('iFixit') ? (
              <>
                This map is a guide to the best bike routes in Chattanooga. Made with ❤️ by <ExternalLink href={resource.url}>iFixit</ExternalLink>, the free repair guide for every thing.
              </>
            ) : (
              <>
                <ExternalLink href={resource.url}>{resource.name}</ExternalLink> - {resource.description}
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  </div>
);

// Footer Component
const Footer = () => (
  <div className="footer">
    <h4 className="footer-title">Get Out and Have Fun</h4>
    <p>Pedal your way through Chattanooga&apos;s best spots—feel the river breeze, roll up to the Zoo for an up-close animal encounter, explore the Aquarium&apos;s underwater wonders, and step back in time at the Railroad Museum. Grab your bike, gather friends, and enjoy the ride!</p>
    <p>© {new Date().getFullYear()} BikeMap</p>
  </div>
);

// Main provider component
export function MapLegendProvider({ children }: { children: React.ReactNode }) {
  // Track state in this parent component
  const [isOpen, setIsOpen] = useState(true);
  const [selectedRoute, setSelectedRoute] = useState<string | null>(null);
  // Add state for map layers
  const [showAttractions, setShowAttractions] = useState(false);
  const [showBikeResources, setShowBikeResources] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const toggleButtonRef = useRef<HTMLButtonElement>(null);
  
  const toggle = useCallback(() => {
    setIsOpen(!isOpen);
    
    // Dispatch event for map resizing
    window.dispatchEvent(new CustomEvent('sidebar-toggle', { 
      detail: { isOpen: !isOpen } 
    }));
  }, [isOpen]);

  // Handle clicks outside the sidebar
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // Only handle clicks on mobile (screen width <= 768px)
      if (window.innerWidth > 768) return;
      
      // Don't close if clicking the toggle button
      if (toggleButtonRef.current?.contains(event.target as Node)) return;
      
      // Don't close if clicking inside the sidebar
      if (sidebarRef.current?.contains(event.target as Node)) return;
      
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
  const handleRouteSelect = useCallback((routeId: string) => {
    setSelectedRoute(routeId);
    
    // Dispatch event for map to update route opacity
    window.dispatchEvent(new CustomEvent('route-select', { 
      detail: { routeId } 
    }));

    // Close sidebar on mobile after selection
    if (window.innerWidth <= 768 && isOpen) {
      toggle();
    }
  }, [isOpen, toggle]);

  // Function to toggle attraction layer
  const toggleAttractionLayer = useCallback(() => {
    const newValue = !showAttractions;
    setShowAttractions(newValue);
    
    // Dispatch event for map to show or hide attractions
    window.dispatchEvent(new CustomEvent('layer-toggle', { 
      detail: { 
        layer: 'attractions', 
        visible: newValue 
      } 
    }));
  }, [showAttractions]);

  // Function to toggle bike resources layer
  const toggleBikeResourcesLayer = useCallback(() => {
    const newValue = !showBikeResources;
    setShowBikeResources(newValue);
    
    // Dispatch event for map to show or hide bike resources
    window.dispatchEvent(new CustomEvent('layer-toggle', { 
      detail: { 
        layer: 'bikeResources', 
        visible: newValue 
      } 
    }));
  }, [showBikeResources]);

  // Function to center map on a specific location
  const centerOnLocation = useCallback((location: { latitude: number; longitude: number; name: string; }) => {
    // Dispatch event for map to center and show pin
    window.dispatchEvent(new CustomEvent('center-location', { 
      detail: { 
        location: location 
      } 
    }));

    // Close sidebar on mobile after selection
    if (window.innerWidth <= 768 && isOpen) {
      toggle();
    }
  }, [isOpen, toggle]);

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
              onToggleAttractions={toggleAttractionLayer}
              onToggleBikeResources={toggleBikeResourcesLayer}
            />

            <AttractionsList 
              show={showAttractions} 
              onCenterLocation={centerOnLocation} 
            />

            <BikeResourcesList 
              show={showBikeResources} 
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

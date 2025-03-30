'use client';

import React, { useState, useEffect, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

import { 
  faMap, 
  faInfoCircle, 
  faLayerGroup, 
  faCompass, 
  faMapMarkerAlt, 
  faRoute, 
  faHiking,
  faTimes, faFish, faPaw, faTrain, faGamepad,
  faLocationArrow
} from '@fortawesome/free-solid-svg-icons';
import { bikeRoutes } from '@/data/bike_routes';

// Map Features
export const mapFeatures = [
  {
    name: 'Tennessee Aquarium',
    description: "Immerse yourself in Chattanooga's underwater world—perfect for families and nature lovers!",
    address: '1 Broad Street, Chattanooga, TN 37402',
    latitude: 35.0558333, // :contentReference[oaicite:0]{index=0}
    longitude: -85.3111111, // :contentReference[oaicite:1]{index=1}
    icon: faFish,
  },
  {
    name: 'Chattanooga Zoo at Warner Park',
    description: 'Meet furry, feathered, and scaly friends at the Chattanooga Zoo—an easy, fun stop for all ages.',
    address: '301 N Holtzclaw Avenue, Chattanooga, TN 37404',
    latitude: 35.0431,
    longitude: -85.2837,
    icon: faPaw,
  },
  {
    name: 'Tennessee Valley Railroad Museum',
    description: 'Step back in time on nostalgic train rides and explore vintage locomotives at the Railroad Museum.',
    address: '4119 Cromwell Road, Chattanooga, TN 37421',
    latitude: 35.0657,
    longitude: -85.2031,
    icon: faTrain,
  },
  {
    name: 'Chattanooga Pinball Museum',
    description: 'Score big with classic and modern pinball games—get your flippers ready for family-friendly fun!',
    address: '409 Broad Street, Chattanooga, TN 37402',
    latitude: 35.0539,
    longitude: -85.3121,
    icon: faGamepad,
  },
  {
    name: 'Outdoor Chattanooga',
    description: 'Your go-to resource for outdoor adventure and recreation in Chattanooga.',
    address: '200 River Street, Chattanooga, TN 37405',
    latitude: 35.0628,
    longitude: -85.3060,
    icon: faHiking,
  },
];

import { faBicycle, faMountain, faRoad, faBolt, faHandsHelping } from '@fortawesome/free-solid-svg-icons';

export const bikeResources = [
  {
    name: 'Suck Creek Cycle',
    description: "Chattanooga's premier local bike shop offering premium brands and expert repairs for mountain biking enthusiasts.",
    address: '630 W Bell Avenue, Chattanooga, TN 37405',
    latitude: 35.0735,
    longitude: -85.3188,
    icon: faMountain,
  },
  {
    name: 'East Ridge Bicycles',
    description: 'Serving the community for over 35 years with a wide selection of bikes and professional fitting services.',
    address: '5910 Ringgold Road, Chattanooga, TN 37412',
    latitude: 34.9899,
    longitude: -85.1992,
    icon: faBicycle,
  },
  {
    name: 'Trek Bicycle Store',
    description: 'Official retailer offering a range of Trek bikes, accessories, and professional maintenance services.',
    address: '307 Manufacturers Road, Suite 117, Chattanooga, TN 37405',
    latitude: 35.0617,
    longitude: -85.3086,
    icon: faRoad,
  },
  {
    name: 'Chatt eBikes',
    description: "Chattanooga's premium electric bike shop specializing in sales, rentals, and services for electric bicycles.",
    address: '1404 McCallie Avenue, Suite 102, Chattanooga, TN 37404',
    latitude: 35.0375,
    longitude: -85.2845,
    icon: faBolt,
  },
  {
    name: 'Two Bikes Chattanooga',
    description: 'Non-profit bike shop transforming donated bikes into practical transportation for underserved community members.',
    address: '1810 E. Main Street, Suite 100, Chattanooga, TN 37404',
    latitude: 35.0350,
    longitude: -85.2830,
    icon: faHandsHelping,
  },
];

// Directly export a single component that combines provider, sidebar and trigger
export function MapLegendProvider({ children }: { children: React.ReactNode }) {
  // Track state in this parent component
  const [isOpen, setIsOpen] = useState(true);
  const [selectedRoute, setSelectedRoute] = useState<string | null>(null);
  // Add state for map layers
  const [showAttractions, setShowAttractions] = useState(false);
  const [showBikeResources, setShowBikeResources] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const toggleButtonRef = useRef<HTMLButtonElement>(null);
  
  const toggle = () => {
    console.log('Toggling sidebar from', isOpen, 'to', !isOpen);
    setIsOpen(!isOpen);
    
    // Dispatch event for map resizing
    window.dispatchEvent(new CustomEvent('sidebar-toggle', { 
      detail: { isOpen: !isOpen } 
    }));
  };

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
  }, [isOpen]);

  // Function to handle route selection
  const handleRouteSelect = (routeId: string) => {
    console.log('MapLegend: Route selected:', routeId);
    setSelectedRoute(routeId);
    
    // Dispatch event for map to update route opacity
    const event = new CustomEvent('route-select', { 
      detail: { routeId } 
    });
    console.log('MapLegend: Dispatching route-select event:', event);
    window.dispatchEvent(event);

    // Close sidebar on mobile after selection
    if (window.innerWidth <= 768 && isOpen) {
      toggle();
    }
  };

  // Function to toggle attraction layer
  const toggleAttractionLayer = () => {
    const newValue = !showAttractions;
    setShowAttractions(newValue);
    
    // Dispatch event for map to show or hide attractions
    window.dispatchEvent(new CustomEvent('layer-toggle', { 
      detail: { 
        layer: 'attractions', 
        visible: newValue 
      } 
    }));
  };

  // Function to toggle bike resources layer
  const toggleBikeResourcesLayer = () => {
    const newValue = !showBikeResources;
    setShowBikeResources(newValue);
    
    // Dispatch event for map to show or hide bike resources
    window.dispatchEvent(new CustomEvent('layer-toggle', { 
      detail: { 
        layer: 'bikeResources', 
        visible: newValue 
      } 
    }));
  };

  // Function to center map on a specific location
  const centerOnLocation = (location: any) => {
    console.log('MapLegend: Centering on location:', location);
    
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
  };
  
  // Log the state on mount
  useEffect(() => {
    console.log('MapLegendProvider mounted with isOpen:', isOpen);
  }, [isOpen]);
  
  // Log state changes
  useEffect(() => {
    console.log('Sidebar isOpen changed to:', isOpen);
  }, [isOpen]);

  // Listen for route-deselect event
  useEffect(() => {
    const handleRouteDeselect = () => {
      console.log('MapLegend: Received route-deselect event');
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
      <div 
        style={{
          position: 'fixed',
          top: '16px',
          left: '16px',
          zIndex: 1000
        }}
      >
        <button 
          ref={toggleButtonRef}
          onClick={toggle}
          style={{
            backgroundColor: 'white',
            borderRadius: '9999px',
            padding: '12px',
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: 'none'
          }}
        >
          <FontAwesomeIcon 
            icon={isOpen ? faTimes : faLayerGroup} 
            style={{ width: '20px', height: '20px', color: '#374151' }}
          />
        </button>
      </div>
      
      {/* Sidebar - always in DOM but transforms off-screen when closed */}
      <div 
        ref={sidebarRef}
        style={{
          position: 'fixed',
          top: 100,
          left: 0,
          height: '100%',
          width: '280px',
          backgroundColor: 'white',
          boxShadow: '2px 0 5px rgba(0,0,0,0.1)',
          zIndex: 999,
          overflow: 'hidden',
          transition: 'transform 0.3s ease-in-out',
          transform: isOpen ? 'translateX(0)' : 'translateX(-100%)'
        }}
      >
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          padding: '12px 16px',
          borderBottom: '1px solid #eee',
          backgroundColor: '#f8f9fa'
        }}>
          <h2 style={{ 
            fontSize: '18px', 
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <FontAwesomeIcon icon={faMap} style={{ width: '20px', height: '20px', color: '#2563eb' }} />
            <span>Chattanooga Bike Map</span>
          </h2>
        </div>
        
        <div style={{ overflowY: 'auto', height: 'calc(100% - 56px)' }}>
          <div style={{ padding: '16px' }}>
            {/* Trail Types */}
            <div style={{ marginBottom: '24px' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 500, marginBottom: '8px', color: '#4b5563' }}>
                Pick a Loop
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {bikeRoutes.map((route) => (
                  <div 
                    key={route.id} 
                    onClick={() => handleRouteSelect(route.id)}
                    style={{ 
                      padding: '8px', 
                      borderRadius: '4px',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease-in-out',
                      backgroundColor: selectedRoute === route.id ? 'rgba(37, 99, 235, 0.1)' : 'transparent',
                      border: '1px solid',
                      borderColor: selectedRoute === route.id ? 'rgb(37, 99, 235)' : 'transparent'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'rgba(37, 99, 235, 0.05)';
                      e.currentTarget.style.borderColor = 'rgb(37, 99, 235)';
                    }}
                    onMouseLeave={(e) => {
                      if (selectedRoute !== route.id) {
                        e.currentTarget.style.backgroundColor = 'transparent';
                        e.currentTarget.style.borderColor = 'transparent';
                      }
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div
                        style={{ 
                          width: '16px', 
                          height: '16px', 
                          borderRadius: '4px',
                          backgroundColor: route.color 
                        }}
                      />
                      <span style={{ fontWeight: 500 }}>{route.name}</span>
                    </div>
                    <div style={{ 
                      fontSize: '12px', 
                      color: '#6b7280', 
                      marginTop: '4px',
                      marginLeft: '28px' 
                    }}>
                      {route.description}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Map Layers */}
            <div style={{ marginBottom: '24px' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 500, marginBottom: '8px', color: '#4b5563' }}>
                Map Layers
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {/* Attractions Layer Toggle */}
                <div 
                  onClick={toggleAttractionLayer}
                  style={{ 
                    padding: '8px', 
                    borderRadius: '4px',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease-in-out',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <FontAwesomeIcon 
                      icon={faMapMarkerAlt} 
                      style={{ width: '16px', height: '16px', color: '#6b7280' }} 
                    />
                    <span style={{ fontWeight: 500 }}>Attractions</span>
                  </div>
                  <div style={{
                    width: '40px',
                    height: '20px',
                    backgroundColor: showAttractions ? '#3b82f6' : '#d1d5db',
                    borderRadius: '999px',
                    position: 'relative',
                    transition: 'background-color 0.2s',
                  }}>
                    <div style={{
                      position: 'absolute',
                      top: '2px',
                      left: showAttractions ? '22px' : '2px',
                      width: '16px',
                      height: '16px',
                      backgroundColor: 'white',
                      borderRadius: '50%',
                      transition: 'left 0.2s',
                    }}/>
                  </div>
                </div>

                {/* Bike Resources Layer Toggle */}
                <div 
                  onClick={toggleBikeResourcesLayer}
                  style={{ 
                    padding: '8px', 
                    borderRadius: '4px',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease-in-out',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <FontAwesomeIcon 
                      icon={faBicycle} 
                      style={{ width: '16px', height: '16px', color: '#6b7280' }} 
                    />
                    <span style={{ fontWeight: 500 }}>Bike Resources</span>
                  </div>
                  <div style={{
                    width: '40px',
                    height: '20px',
                    backgroundColor: showBikeResources ? '#3b82f6' : '#d1d5db',
                    borderRadius: '999px',
                    position: 'relative',
                    transition: 'background-color 0.2s',
                  }}>
                    <div style={{
                      position: 'absolute',
                      top: '2px',
                      left: showBikeResources ? '22px' : '2px',
                      width: '16px',
                      height: '16px',
                      backgroundColor: 'white',
                      borderRadius: '50%',
                      transition: 'left 0.2s',
                    }}/>
                  </div>
                </div>
              </div>
            </div>

            {/* Attractions */}
            <div style={{ 
              marginBottom: '24px',
              display: showAttractions ? 'block' : 'none' 
            }}>
              <h3 style={{ fontSize: '14px', fontWeight: 500, marginBottom: '8px', color: '#4b5563' }}>
                Attractions
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {mapFeatures.map((location) => (
                  <div 
                    key={location.name} 
                    style={{ 
                      padding: '8px', 
                      borderRadius: '6px',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease-in-out',
                      border: '1px solid transparent',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                    }}
                    onClick={() => centerOnLocation(location)}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'rgba(37, 99, 235, 0.05)';
                      e.currentTarget.style.borderColor = 'rgba(37, 99, 235, 0.3)';
                      e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                      e.currentTarget.style.borderColor = 'transparent';
                      e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.05)';
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ 
                        width: '28px', 
                        height: '28px', 
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: '#EBF4FF',
                        border: '2px solid #3b82f6'
                      }}>
                        <FontAwesomeIcon 
                          icon={location.icon} 
                          style={{ width: '14px', height: '14px', color: '#3b82f6' }} 
                        />
                      </div>
                      <span style={{ fontWeight: 500 }}>{location.name}</span>
                    </div>
                    <div style={{ 
                      fontSize: '12px', 
                      color: '#6b7280', 
                      marginTop: '4px',
                      marginLeft: '40px', 
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}>
                      <span style={{ flex: 1 }}>{location.description}</span>
                      <div style={{ 
                        display: 'flex',
                        alignItems: 'center', 
                        justifyContent: 'center',
                        padding: '6px',
                        borderRadius: '4px',
                        backgroundColor: '#EBF4FF',
                        color: '#3b82f6',
                        marginLeft: '8px'
                      }}>
                        <FontAwesomeIcon 
                          icon={faLocationArrow} 
                          style={{ width: '14px', height: '14px' }} 
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Bike Resources */}
            <div style={{ 
              marginBottom: '24px',
              display: showBikeResources ? 'block' : 'none' 
            }}>
              <h3 style={{ fontSize: '14px', fontWeight: 500, marginBottom: '8px', color: '#4b5563' }}>
                Bike Resources
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {bikeResources.map((location) => (
                  <div 
                    key={location.name} 
                    style={{ 
                      padding: '8px', 
                      borderRadius: '6px',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease-in-out',
                      border: '1px solid transparent',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                    }}
                    onClick={() => centerOnLocation(location)}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'rgba(52, 211, 153, 0.05)';
                      e.currentTarget.style.borderColor = 'rgba(52, 211, 153, 0.3)';
                      e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                      e.currentTarget.style.borderColor = 'transparent';
                      e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.05)';
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ 
                        width: '28px', 
                        height: '28px', 
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: '#ECFDF5',
                        border: '2px solid #34d399'
                      }}>
                        <FontAwesomeIcon 
                          icon={location.icon} 
                          style={{ width: '14px', height: '14px', color: '#34d399' }} 
                        />
                      </div>
                      <span style={{ fontWeight: 500 }}>{location.name}</span>
                    </div>
                    <div style={{ 
                      fontSize: '12px', 
                      color: '#6b7280', 
                      marginTop: '4px',
                      marginLeft: '40px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}>
                      <span style={{ flex: 1 }}>{location.description}</span>
                      <div style={{ 
                        display: 'flex',
                        alignItems: 'center', 
                        justifyContent: 'center',
                        padding: '6px',
                        borderRadius: '4px',
                        backgroundColor: '#ECFDF5',
                        color: '#34d399',
                        marginLeft: '8px'
                      }}>
                        <FontAwesomeIcon 
                          icon={faLocationArrow} 
                          style={{ width: '14px', height: '14px' }} 
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Information */}
            <div style={{ marginBottom: '24px' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 500, marginBottom: '8px', color: '#4b5563' }}>
                Information
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ padding: '8px', borderRadius: '4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <FontAwesomeIcon 
                      icon={faInfoCircle} 
                      style={{ width: '16px', height: '16px', color: '#6b7280' }} 
                    />
                    <span style={{ fontWeight: 500 }}>About This Map</span>
                    <p>This map is a guide to the best bike routes in Chattanooga. Made with ❤️ by <a href="https://www.ifixit.com">iFixit</a>, the free repair guide for every thing.</p>
                  </div>
                </div>
                <div style={{ padding: '8px', borderRadius: '4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <FontAwesomeIcon 
                      icon={faLayerGroup} 
                      style={{ width: '16px', height: '16px', color: '#6b7280' }} 
                    />
                    <span style={{ fontWeight: 500 }}>Local resources</span>
                    <p><a href="https://www.chattanooga.gov/bike-map">Chattanooga City Bike Rentals</a></p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ 
          borderTop: '1px solid #eee', 
          padding: '12px', 
          fontSize: '12px', 
          textAlign: 'center', 
          color: '#6b7280' 
        }}>
          <h4 style={{ fontSize: '14px', fontWeight: 500, marginBottom: '8px' }}>Get Out and Have Fun</h4>
          <p>Pedal your way through Chattanooga&apos;s best spots—feel the river breeze, roll up to the Zoo for an up-close animal encounter, explore the Aquarium&apos;s underwater wonders, and step back in time at the Railroad Museum. Grab your bike, gather friends, and enjoy the ride!</p>
          <p style={{ marginTop: '4px' }}>© {new Date().getFullYear()} BikeMap</p>
        </div>
      </div>
    </>
  );
}

// Export these components to maintain compatibility with existing imports
export function MapLegend() {
  return null; // This is now handled in the provider
}

export function MapLegendTrigger() {
  return null; // This is now handled in the provider
}

export function SidebarDebug() {
  return null; // This is now handled in the provider
} 
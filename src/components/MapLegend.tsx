'use client';

import React, { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faMap, 
  faInfoCircle, 
  faLayerGroup, 
  faCompass, 
  faMapMarkerAlt, 
  faRoute, 
  faTimes
} from '@fortawesome/free-solid-svg-icons';

// Legend items with colors and descriptions
const legendItems = [
  {
    name: 'Zoo Loop',
    color: 'red',
    description: 'Bike-friendly paved trails and paths',
    icon: faRoute,
  },
  {
    name: 'Downtown Loop',
    color: 'green',
    description: 'Unpaved trails suitable for mountain bikes',
    icon: faRoute,
  },
  {
    name: 'The View Loop',
    color: 'blue',
    description: 'Dedicated bike lanes on roads',
    icon: faRoute,
  },
  {
    name: 'Points of Interest',
    color: '#FBBC05',
    description: 'Parks, rest areas, and repair stations',
    icon: faMapMarkerAlt,
  },
];

const mapFeatures = [
  {
    name: 'Your Location',
    description: 'Blue pulsing dot shows your current position',
    icon: faMapMarkerAlt,
  },
  {
    name: 'Navigation',
    description: 'Drag to pan, scroll to zoom, rotate with Ctrl+drag',
    icon: faCompass,
  },
];

// Directly export a single component that combines provider, sidebar and trigger
export function MapLegendProvider({ children }: { children: React.ReactNode }) {
  // Track state in this parent component
  const [isOpen, setIsOpen] = useState(true);
  
  const toggle = () => {
    console.log('Toggling sidebar from', isOpen, 'to', !isOpen);
    setIsOpen(!isOpen);
    
    // Dispatch event for map resizing
    window.dispatchEvent(new CustomEvent('sidebar-toggle', { 
      detail: { isOpen: !isOpen } 
    }));
  };
  
  // Log the state on mount
  useEffect(() => {
    console.log('MapLegendProvider mounted with isOpen:', isOpen);
  }, []);
  
  // Log state changes
  useEffect(() => {
    console.log('Sidebar isOpen changed to:', isOpen);
  }, [isOpen]);
  
  return (
    <>
      {children}
      
      {/* Debug indicator always visible */}
      <div 
        style={{
          position: 'fixed',
          bottom: '16px',
          right: '16px',
          backgroundColor: 'rgba(0,0,0,0.75)',
          color: 'white',
          padding: '8px 12px',
          borderRadius: '4px',
          zIndex: 5000,
          fontFamily: 'monospace',
          fontSize: '14px'
        }}
      >
        Sidebar: {isOpen ? 'OPEN' : 'CLOSED'}
      </div>
      
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
          <button 
            onClick={toggle}
            style={{
              backgroundColor: 'transparent',
              border: 'none',
              padding: '8px',
              cursor: 'pointer',
              color: '#6b7280'
            }}
          >
            <FontAwesomeIcon icon={faTimes} style={{ width: '20px', height: '20px' }} />
          </button>
        </div>
        
        <div style={{ overflowY: 'auto', height: 'calc(100% - 56px)' }}>
          <div style={{ padding: '16px' }}>
            {/* Trail Types */}
            <div style={{ marginBottom: '24px' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 500, marginBottom: '8px', color: '#4b5563' }}>
                Trail Types
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {legendItems.map((item) => (
                  <div key={item.name} style={{ padding: '8px', borderRadius: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div
                        style={{ 
                          width: '16px', 
                          height: '16px', 
                          borderRadius: '4px',
                          backgroundColor: item.color 
                        }}
                      />
                      <span style={{ fontWeight: 500 }}>{item.name}</span>
                    </div>
                    <div style={{ 
                      fontSize: '12px', 
                      color: '#6b7280', 
                      marginTop: '4px',
                      marginLeft: '28px' 
                    }}>
                      {item.description}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Map Features */}
            <div style={{ marginBottom: '24px' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 500, marginBottom: '8px', color: '#4b5563' }}>
                Map Features
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {mapFeatures.map((feature) => (
                  <div key={feature.name} style={{ padding: '8px', borderRadius: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <FontAwesomeIcon 
                        icon={feature.icon} 
                        style={{ width: '16px', height: '16px', color: '#6b7280' }} 
                      />
                      <span style={{ fontWeight: 500 }}>{feature.name}</span>
                    </div>
                    <div style={{ 
                      fontSize: '12px', 
                      color: '#6b7280', 
                      marginTop: '4px',
                      marginLeft: '28px' 
                    }}>
                      {feature.description}
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
                  </div>
                </div>
                <div style={{ padding: '8px', borderRadius: '4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <FontAwesomeIcon 
                      icon={faLayerGroup} 
                      style={{ width: '16px', height: '16px', color: '#6b7280' }} 
                    />
                    <span style={{ fontWeight: 500 }}>Toggle Map Layers</span>
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
          <p>Discover the Scenic City on two wheels! Whether you’re pedaling past the Tennessee Aquarium for a glimpse of underwater wonders, coasting by the Chattanooga Zoo to see furry friends, or cruising toward the historic Railroad Museum for a step back in time, this map has you covered. From easy-going boardwalks to mountain-bike-ready trails, there’s a loop for every cyclist’s sense of adventure.
          </p>
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
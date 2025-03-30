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
    description: 'Fun route through the university to visit the zoo and a nearby park',
    icon: faRoute,
  },
  {
    name: 'Downtown Loop',
    color: '#00FF00',
    description: 'Explore the riverwalk and visit the aquarium',
    icon: faRoute,
  },
  {
    name: 'The View Loop',
    color: 'blue',
    description: 'The best city and river views around',
    icon: faRoute,
  },
  {
    name: 'Points of Interest',
    color: '#FBBC05',
    description: 'Aquarium, Zoo, & Railroad Museum',
    icon: faMapMarkerAlt,
  },
];

const mapFeatures = [
  {
    name: 'Your Location',
    description: 'Blue Dot: Your real-time location',
    icon: faMapMarkerAlt,
  },
  {
    name: 'Navigation',
    description: 'Controls: Drag to move, pinch to zoom, hold Ctrl to rotate',
    icon: faCompass,
  },
  {
    name: 'Map Layers',
    description: 'Toggle for different views',
    icon: faLayerGroup,
  },
];

const proTips = [
  {
    name: 'Points of Interest',
    description: 'Look for parks, rest areas, and repair stations along the way',
    icon: faMapMarkerAlt,
  },
  {
    name: 'Scenic Routes',
    description: 'Enjoy the scenic greenways, perfect for all skill levels',
    icon: faRoute,
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
  }, [isOpen]);
  
  // Log state changes
  useEffect(() => {
    console.log('Sidebar isOpen changed to:', isOpen);
  }, [isOpen]);
  
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
        </div>
        
        <div style={{ overflowY: 'auto', height: 'calc(100% - 56px)' }}>
          <div style={{ padding: '16px' }}>
            {/* Trail Types */}
            <div style={{ marginBottom: '24px' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 500, marginBottom: '8px', color: '#4b5563' }}>
                Pick a Loop
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

            {/* Pro Tips */}
            <div style={{ marginBottom: '24px' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 500, marginBottom: '8px', color: '#4b5563' }}>
                Pro Tips
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {proTips.map((tip) => (
                  <div key={tip.name} style={{ padding: '8px', borderRadius: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <FontAwesomeIcon 
                        icon={tip.icon} 
                        style={{ width: '16px', height: '16px', color: '#6b7280' }} 
                      />
                      <span style={{ fontWeight: 500 }}>{tip.name}</span>
                    </div>
                    <div style={{ 
                      fontSize: '12px', 
                      color: '#6b7280', 
                      marginTop: '4px',
                      marginLeft: '28px' 
                    }}>
                      {tip.description}
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
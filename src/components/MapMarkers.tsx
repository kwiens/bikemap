import mapboxgl from 'mapbox-gl';
import { MapFeature, BikeResource, BikeRentalLocation } from '@/data/geo_data';

// Helper function to ensure FontAwesome is loaded
const ensureFontAwesomeLoaded = () => {
  if (!document.getElementById('fontawesome-css')) {
    const link = document.createElement('link');
    link.id = 'fontawesome-css';
    link.rel = 'stylesheet';
    link.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css';
    link.integrity = 'sha512-1ycn6IcaQQ40/MKBW2W4Rhis/DbILU74C1vSrLJxCq57o941Ym01SwNsOMqvEBFlcgUa6xLiPY/NS5R+E6ztJQ==';
    link.crossOrigin = 'anonymous';
    link.referrerPolicy = 'no-referrer';
    document.head.appendChild(link);
  }
};

// Run once on module load to ensure FontAwesome is loaded
ensureFontAwesomeLoaded();

// Create marker DOM elements directly
function createMarkerElement(className: string, iconClass: string, iconColor: string): HTMLElement {
  // Create container
  const el = document.createElement('div');
  el.className = className;
  
  // Create icon container
  const icon = document.createElement('div');
  icon.className = 'marker-icon';
  
  // Create icon element
  const iconElement = document.createElement('i');
  iconElement.className = `fas ${iconClass}`;
  iconElement.style.color = iconColor;
  iconElement.style.fontSize = '22px';
  iconElement.style.position = 'relative';
  
  // Assemble the elements
  icon.appendChild(iconElement);
  el.appendChild(icon);
  
  return el;
}

// Create popup HTML directly
function createPopupHTML(name: string, description: string, address: string): string {
  return `
    <div class="map-popup">
      <h3>${name}</h3>
      <p>${description}</p>
      <p class="address">
        <strong>Address:</strong> 
        <a href="https://maps.google.com/?q=${address}" target="_blank" rel="noopener noreferrer">
          ${address}
        </a>
      </p>
    </div>
  `;
}

// Helper function to create attraction marker using direct DOM manipulation
export function createAttractionMarker(feature: MapFeature): mapboxgl.Marker {
  // Get icon class
  let iconClass = 'fa-map-marker-alt';
  
  // Log the icon information to help debug
  console.log(`Icon for ${feature.name}:`, feature.icon?.iconName);
  
  if (feature.icon) {
    // Extract iconName from the FontAwesome icon object
    const iconName = feature.icon.iconName;
    
    switch (iconName) {
      case 'fish': iconClass = 'fa-fish'; break;
      case 'paw': iconClass = 'fa-paw'; break;
      case 'train': iconClass = 'fa-train'; break;
      case 'gamepad': iconClass = 'fa-gamepad'; break;
      case 'hiking': iconClass = 'fa-hiking'; break;
      case 'horse-head': iconClass = 'fa-horse-head'; break;
      case 'palette': iconClass = 'fa-palette'; break;
      // Special handling for Outdoor Chattanooga
      default:
        // Check if the name matches to ensure we get the right icon
        if (feature.name === 'Outdoor Chattanooga') {
          iconClass = 'fa-hiking';
        } else {
          iconClass = 'fa-map-marker-alt';
        }
    }
  }
  
  // Create element
  const el = createMarkerElement('map-marker attraction-marker', iconClass, '#3b82f6');
  
  // Create popup
  const popup = new mapboxgl.Popup({ 
    offset: 25,
    closeButton: true,
    closeOnClick: false,
    className: 'custom-popup'
  }).setHTML(createPopupHTML(feature.name, feature.description, feature.address));
  
  // Create and return marker
  return new mapboxgl.Marker(el)
    .setLngLat([feature.longitude, feature.latitude])
    .setPopup(popup);
}

// Helper function to create bike resource marker using direct DOM manipulation
export function createBikeResourceMarker(resource: BikeResource): mapboxgl.Marker {
  // Get icon class
  let iconClass = 'fa-bicycle';
  if (resource.icon) {
    switch (resource.icon.iconName) {
      case 'bicycle': iconClass = 'fa-bicycle'; break;
      case 'mountain': iconClass = 'fa-mountain'; break;
      case 'road': iconClass = 'fa-road'; break;
      case 'bolt': iconClass = 'fa-bolt'; break;
      case 'hands-helping': iconClass = 'fa-hands-helping'; break;
      default: iconClass = 'fa-bicycle';
    }
  }
  
  // Create element
  const el = createMarkerElement('map-marker bike-marker', iconClass, '#34d399');
  
  // Create popup
  const popup = new mapboxgl.Popup({ 
    offset: 25,
    closeButton: true,
    closeOnClick: false,
    className: 'custom-popup'
  }).setHTML(createPopupHTML(resource.name, resource.description, resource.address));
  
  // Create and return marker
  return new mapboxgl.Marker(el)
    .setLngLat([resource.longitude, resource.latitude])
    .setPopup(popup);
}

// Helper function to create location marker
export function createLocationMarker(
  longitude: number, 
  latitude: number
): mapboxgl.Marker {
  // Create element
  const el = document.createElement('div');
  el.className = 'current-location-marker';
  
  // Create inner elements
  el.innerHTML = `
    <div class="location-dot"></div>
    <div class="location-pulse"></div>
  `;
  
  // Create and return marker
  return new mapboxgl.Marker({
    element: el,
    anchor: 'center'
  }).setLngLat([longitude, latitude]);
}

// Helper function to create highlight marker
export function createHighlightMarker(
  longitude: number, 
  latitude: number
): mapboxgl.Marker {
  // Create element
  const el = document.createElement('div');
  el.className = 'highlight-marker';
  
  // Create and return marker
  return new mapboxgl.Marker({
    element: el,
    anchor: 'center'
  }).setLngLat([longitude, latitude]);
}

// Helper function to create bike rental marker using direct DOM manipulation
export function createBikeRentalMarker(location: BikeRentalLocation): mapboxgl.Marker {
  // Get icon class
  let iconClass = 'fa-bicycle';
  if (location.icon) {
    switch (location.icon.iconName) {
      case 'bicycle': iconClass = 'fa-bicycle'; break;
      default: iconClass = 'fa-bicycle';
    }
  }
  
  // Create element
  const el = createMarkerElement('map-marker rental-marker', iconClass, '#9333ea');
  
  // Create popup HTML with rental-specific information
  const popupHTML = `
    <div class="map-popup">
      <h3>${location.name}</h3>
      <p>${location.description}</p>
      <p class="address">
        <strong>Address:</strong> 
        <a href="https://maps.google.com/?q=${location.address}" target="_blank" rel="noopener noreferrer">
          ${location.address}
        </a>
      </p>
      <p><strong>Type:</strong> ${location.rentalType}</p>
      <p><strong>Price:</strong> ${location.price}</p>
      <p><strong>Hours:</strong> ${location.hours}</p>
    </div>
  `;
  
  // Create popup
  const popup = new mapboxgl.Popup({ 
    offset: 25,
    closeButton: true,
    closeOnClick: false,
    className: 'custom-popup'
  }).setHTML(popupHTML);
  
  // Create and return marker
  return new mapboxgl.Marker(el)
    .setLngLat([0, 0]) // We'll set the coordinates after geocoding
    .setPopup(popup);
} 
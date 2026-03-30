import mapboxgl from 'mapbox-gl';
import type {
  MapFeature,
  BikeResource,
  BikeRentalLocation,
} from '@/data/geo_data';

// Helper function to ensure FontAwesome is loaded
export const ensureFontAwesomeLoaded = () => {
  if (!document.getElementById('fontawesome-css')) {
    const link = document.createElement('link');
    link.id = 'fontawesome-css';
    link.rel = 'stylesheet';
    link.href =
      'https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.7.2/css/all.min.css';
    link.crossOrigin = 'anonymous';
    document.head.appendChild(link);
  }
};

// Run once on module load to ensure FontAwesome is loaded
ensureFontAwesomeLoaded();

// Marker Manager class for managing collections of markers
export class MarkerManager {
  private markers: mapboxgl.Marker[] = [];
  private activeMarker: mapboxgl.Marker | null = null;

  add(marker: mapboxgl.Marker, map: mapboxgl.Map): void {
    this.attachPopupHandlers(marker);
    this.markers.push(marker);
    marker.addTo(map);
  }

  show(map: mapboxgl.Map): void {
    this.markers.forEach((m) => {
      m.addTo(map);
    });
  }

  hide(): void {
    this.markers.forEach((m) => {
      m.remove();
    });
  }

  clear(): void {
    this.hide();
    this.markers = [];
    this.activeMarker = null;
  }

  findByCoordinates(lng: number, lat: number): mapboxgl.Marker | undefined {
    return this.markers.find((m) => {
      const pos = m.getLngLat();
      return pos.lng === lng && pos.lat === lat;
    });
  }

  getMarkers(): mapboxgl.Marker[] {
    return this.markers;
  }

  openPopupFor(marker: mapboxgl.Marker): void {
    if (marker.getPopup()?.isOpen()) {
      return;
    }

    marker.togglePopup();
  }

  setMarkers(markers: mapboxgl.Marker[]): void {
    this.clear();
    this.markers = markers;
    this.markers.forEach((marker) => {
      this.attachPopupHandlers(marker);
    });
  }

  get length(): number {
    return this.markers.length;
  }

  private attachPopupHandlers(marker: mapboxgl.Marker): void {
    const popup = marker.getPopup();

    if (!popup) {
      return;
    }

    popup.on('open', () => {
      if (this.activeMarker && this.activeMarker !== marker) {
        this.activeMarker.getPopup()?.remove();
      }

      this.activeMarker = marker;
    });

    popup.on('close', () => {
      if (this.activeMarker === marker) {
        this.activeMarker = null;
      }
    });
  }
}

// Create marker DOM elements directly
function createMarkerElement(
  className: string,
  iconClass: string,
  iconColor: string,
): HTMLElement {
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

function shortAddress(address: string): string {
  return address.replace(/,\s*Chattanooga.*$/, '');
}

// Create popup HTML directly
function createPopupHTML(
  name: string,
  description: string,
  address: string,
): string {
  return `
    <div class="map-popup">
      <h3>${name}</h3>
      <p>${description}</p>
      <p class="address">
        <strong>Address:</strong>
        <a href="https://maps.google.com/?q=${address}" target="_blank" rel="noopener noreferrer">
          ${shortAddress(address)}
        </a>
      </p>
    </div>
  `;
}

// Helper function to create attraction marker using direct DOM manipulation
export function createAttractionMarker(feature: MapFeature): mapboxgl.Marker {
  // Get icon class - default to map marker
  let iconClass = 'fa-map-marker-alt';

  if (feature.icon?.iconName) {
    // Automatically construct the FontAwesome class from the icon name
    iconClass = `fa-${feature.icon.iconName}`;
  }

  // Create element
  const el = createMarkerElement(
    'map-marker attraction-marker',
    iconClass,
    '#3b82f6',
  );

  // Create popup
  const popup = new mapboxgl.Popup({
    offset: 25,
    closeButton: true,
    closeOnClick: false,
    className: 'custom-popup',
  }).setHTML(
    createPopupHTML(feature.name, feature.description, feature.address),
  );

  // Create and return marker
  return new mapboxgl.Marker(el)
    .setLngLat([feature.longitude, feature.latitude])
    .setPopup(popup);
}

// Helper function to create bike resource marker using direct DOM manipulation
export function createBikeResourceMarker(
  resource: BikeResource,
): mapboxgl.Marker {
  // Get icon class - default to bicycle
  let iconClass = 'fa-bicycle';

  if (resource.icon?.iconName) {
    // Automatically construct the FontAwesome class from the icon name
    iconClass = `fa-${resource.icon.iconName}`;
  }

  // Create element
  const el = createMarkerElement(
    'map-marker bike-marker',
    iconClass,
    '#34d399',
  );

  // Create popup
  const popup = new mapboxgl.Popup({
    offset: 25,
    closeButton: true,
    closeOnClick: false,
    className: 'custom-popup',
  }).setHTML(
    createPopupHTML(resource.name, resource.description, resource.address),
  );

  // Create and return marker
  return new mapboxgl.Marker(el)
    .setLngLat([resource.longitude, resource.latitude])
    .setPopup(popup);
}

// Helper function to create location marker
export function createLocationMarker(
  longitude: number,
  latitude: number,
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
    anchor: 'center',
  }).setLngLat([longitude, latitude]);
}

// Helper function to create highlight marker
export function createHighlightMarker(
  longitude: number,
  latitude: number,
): mapboxgl.Marker {
  // Create element
  const el = document.createElement('div');
  el.className = 'highlight-marker';

  // Create and return marker
  return new mapboxgl.Marker({
    element: el,
    anchor: 'center',
  }).setLngLat([longitude, latitude]);
}

// Helper function to create bike rental marker using direct DOM manipulation
export function createBikeRentalMarker(
  location: BikeRentalLocation,
): mapboxgl.Marker {
  // Get icon class - default to bicycle
  let iconClass = 'fa-bicycle';

  if (location.icon?.iconName) {
    // Automatically construct the FontAwesome class from the icon name
    iconClass = `fa-${location.icon.iconName}`;
  }

  // Create element
  const el = createMarkerElement(
    'map-marker rental-marker',
    iconClass,
    '#9333EA',
  );

  // Create popup HTML with rental-specific information
  const popupHTML = `
    <div class="map-popup">
      <h3>${location.name}</h3>
      <p>${location.description}</p>
      <p class="address">
        <strong>Address:</strong>
        <a href="https://maps.google.com/?q=${location.address}" target="_blank" rel="noopener noreferrer">
          ${shortAddress(location.address)}
        </a>
      </p>
      <p><strong>Type:</strong> ${location.rentalType}</p>
      <p><strong>Price:</strong> ${location.price}</p>
      <p><strong>Hours:</strong> ${location.hours}</p>
      ${location.availableBikes !== undefined ? `<p><strong>Available Bikes:</strong> ${location.availableBikes}</p>` : ''}
      ${location.availableDocks !== undefined ? `<p><strong>Available Docks:</strong> ${location.availableDocks}</p>` : ''}
      ${location.isChargingStation ? '<p><strong>Charging Station Available</strong></p>' : ''}
    </div>
  `;

  // Create popup
  const popup = new mapboxgl.Popup({
    offset: 25,
    closeButton: true,
    closeOnClick: false,
    className: 'custom-popup',
  }).setHTML(popupHTML);

  // Create and return marker
  return new mapboxgl.Marker({
    element: el,
    anchor: 'bottom',
  })
    .setLngLat([location.longitude, location.latitude])
    .setPopup(popup);
}

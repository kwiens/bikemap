// Custom DOM event names for component communication
export const MAP_EVENTS = {
  ROUTE_SELECT: 'route-select',
  ROUTE_DESELECT: 'route-deselect',
  TRAIL_SELECT: 'trail-select',
  TRAIL_DESELECT: 'trail-deselect',
  AREA_SELECT: 'area-select',
  LAYER_TOGGLE: 'layer-toggle',
  CENTER_LOCATION: 'center-location',
  SIDEBAR_TOGGLE: 'sidebar-toggle',
  ELEVATION_HOVER: 'elevation-hover',
  LOCATION_UPDATE: 'location-update',
  RIDE_STYLE_CHOSEN: 'ride-style-chosen',
} as const;

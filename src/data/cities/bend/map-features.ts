import {
  faFilm,
  faHiking,
  faMountain,
  faPalette,
  faShoppingBag,
  faTree,
  faVolcano,
  faWater,
} from '@fortawesome/free-solid-svg-icons';
import type { MapFeature } from '@/data/map-features';

export const bendMapFeatures: MapFeature[] = [
  {
    name: 'High Desert Museum',
    description:
      'Wildlife, history, and art museum set on 135 acres south of Bend.',
    address: '59800 US-97, Bend, OR 97702',
    latitude: 43.9659212,
    longitude: -121.3415245,
    icon: faPalette,
  },
  {
    name: 'Pilot Butte State Scenic Viewpoint',
    description:
      'Dormant cinder-cone viewpoint with summit trails and panoramic Cascade and high desert views.',
    address: 'Pilot Butte State Scenic Viewpoint, Bend, OR 97701',
    latitude: 44.0596064,
    longitude: -121.2825363,
    icon: faHiking,
  },
  {
    name: 'Old Mill District',
    description:
      'Riverfront shopping, dining, events, and trail district along the Deschutes River.',
    address: '520 SW Powerhouse Dr #624, Bend, OR 97702',
    latitude: 44.0455247,
    longitude: -121.3147348,
    icon: faShoppingBag,
  },
  {
    name: 'Drake Park and Mirror Pond',
    description:
      'Downtown riverfront park with paths, historic markers, events, and Deschutes River views.',
    address: '777 NW Riverside Blvd, Bend, OR 97703',
    latitude: 44.0584771,
    longitude: -121.3222223,
    icon: faTree,
  },
  {
    name: 'Riverbend Park',
    description:
      'Deschutes River park in the Old Mill area with river access, lawns, and paved and unpaved paths.',
    address: '799 SW Columbia St, Bend, OR 97702',
    latitude: 44.0420798,
    longitude: -121.3221103,
    icon: faTree,
  },
  {
    name: 'Bend Whitewater Park',
    description:
      'Deschutes River whitewater and floating feature near the Old Mill corridor.',
    address: 'Bend Whitewater Park, Southwest Colorado Avenue, Bend, OR 97702',
    latitude: 44.0500883,
    longitude: -121.321275,
    icon: faWater,
  },
  {
    name: 'Shevlin Park',
    description:
      'Large regional park with Tumalo Creek, old-growth forest, high desert terrain, and multi-use trails.',
    address: '18920 Northwest Shevlin Park Road, Bend, OR 97701',
    latitude: 44.0886354,
    longitude: -121.3677594,
    icon: faTree,
  },
  {
    name: 'Riley Ranch Nature Reserve',
    description:
      'Nature reserve with Deschutes River canyon, rimrock cliffs, Cascade views, wildlife, and walking trails.',
    address: '19975 Glen Vista Rd, Bend, OR 97703',
    latitude: 44.1011036,
    longitude: -121.3370861,
    icon: faTree,
  },
  {
    name: 'The Last Blockbuster',
    description:
      'Offbeat Bend landmark known as the last remaining Blockbuster video rental store.',
    address: '211 NE Revere Ave, Bend, OR 97701',
    latitude: 44.0673282,
    longitude: -121.3036849,
    icon: faFilm,
  },
  {
    name: 'Tumalo Falls',
    description:
      'Major waterfall and trail destination west of Bend in the Deschutes National Forest.',
    address: 'Tumalo Falls, Deschutes County, OR',
    latitude: 44.0339295,
    longitude: -121.5668047,
    icon: faWater,
  },
  {
    name: 'Smith Rock State Park',
    description:
      'Regional state park and scenic rock landmark north of Bend near Terrebonne.',
    address: 'Smith Rock State Park, Terrebonne, OR 97760',
    latitude: 44.3670405,
    longitude: -121.141421,
    icon: faMountain,
  },
  {
    name: 'Newberry National Volcanic Monument',
    description:
      'Regional volcanic landscape with lava flows, lakes, trails, and high desert viewpoints south of Bend.',
    address: 'Newberry National Volcanic Monument, OR',
    latitude: 43.8121394,
    longitude: -121.2816712,
    icon: faVolcano,
  },
];

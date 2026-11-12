import {
  faBicycle,
  faFilm,
  faFish,
  faGamepad,
  faHandsHelping,
  faHiking,
  faHorse,
  faHorseHead,
  faMapMarkerAlt,
  faMountain,
  faPalette,
  faPaw,
  faShoppingBag,
  faTrain,
  faTree,
  faVolcano,
  faWater,
  type IconDefinition,
} from '@fortawesome/free-solid-svg-icons';

export interface MapFeature {
  id: number;
  name: string;
  description: string;
  address: string;
  latitude: number;
  longitude: number;
  icon: string;
}

const icons = new Map([
  ['pin', { label: 'Map pin', icon: faMapMarkerAlt }],
  ['aquarium', { label: 'Aquarium', icon: faFish }],
  ['art', { label: 'Art', icon: faPalette }],
  ['bicycle', { label: 'Bicycle', icon: faBicycle }],
  ['carousel', { label: 'Carousel', icon: faHorse }],
  ['community', { label: 'Community center', icon: faHandsHelping }],
  ['film', { label: 'Film', icon: faFilm }],
  ['games', { label: 'Games', icon: faGamepad }],
  ['hiking', { label: 'Hiking', icon: faHiking }],
  ['mountain', { label: 'Mountain', icon: faMountain }],
  ['nature', { label: 'Nature center', icon: faHorseHead }],
  ['park', { label: 'Park', icon: faTree }],
  ['railroad', { label: 'Railroad', icon: faTrain }],
  ['shopping', { label: 'Shopping', icon: faShoppingBag }],
  ['volcano', { label: 'Volcano', icon: faVolcano }],
  ['water', { label: 'Water', icon: faWater }],
  ['zoo', { label: 'Zoo', icon: faPaw }],
]);

export const attractionIconOptions = Array.from(
  icons,
  ([value, { label }]) => ({
    label,
    value,
  }),
);

export function attractionIcon(key: string): IconDefinition {
  return icons.get(key)?.icon ?? faMapMarkerAlt;
}

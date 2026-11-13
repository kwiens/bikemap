import { describe, it, expect } from 'vitest';
import { activeCityId } from '@/config/map.config';
import type { BikeRoute } from './bike-routes';
import type { CityId } from './cities/types';
import { publishCityContent } from './city-content';
import type { MountainBikeTrail } from './mountain-bike-trails';
import { getBikeRoutes, setBikeRoutes } from './route-source';
import { getMountainBikeTrails, setMountainBikeTrails } from './trail-source';

function route(name: string): BikeRoute {
  return {
    id: name,
    name,
    color: '#000',
    description: '',
    icon: {} as BikeRoute['icon'],
    defaultWidth: 4,
    opacity: 1,
    distance: 1,
  };
}

function trail(name: string): MountainBikeTrail {
  return {
    color: '#000000',
    displayName: name,
    icon: {} as MountainBikeTrail['icon'],
    rating: '',
    recArea: 'Somewhere',
    trailName: name,
  };
}

const otherCity: CityId = activeCityId === 'bend' ? 'chattanooga' : 'bend';

describe('publishCityContent', () => {
  it('publishes every list it is given into its store', () => {
    const routes = [route('Riverwalk')];
    const trails = [trail('Raccoon')];
    expect(publishCityContent({ cityId: activeCityId, routes, trails })).toBe(
      true,
    );
    expect(getBikeRoutes()).toBe(routes);
    expect(getMountainBikeTrails()).toBe(trails);
  });

  it('leaves out lists the page did not load (the embed sends routes only)', () => {
    const trails = [trail('Kept')];
    setMountainBikeTrails(trails);
    const routes = [route('Embed')];
    publishCityContent({ cityId: activeCityId, routes });
    expect(getBikeRoutes()).toBe(routes);
    expect(getMountainBikeTrails()).toBe(trails);
  });

  it('refuses content the server resolved for another city', () => {
    const routes = [route('Before')];
    setBikeRoutes(routes);
    expect(
      publishCityContent({ cityId: otherCity, routes: [route('Other')] }),
    ).toBe(false);
    expect(getBikeRoutes()).toBe(routes);
  });
});

import { activeCityId } from '@/config/map.config';
import { bendData } from './bend';
import { chattanoogaData } from './chattanooga';
import type { CityData, CityId } from './types';

export const cityDataById: Record<CityId, CityData> = {
  chattanooga: chattanoogaData,
  bend: bendData,
};

export const activeCityData = cityDataById[activeCityId];

/**
 * The known city ids, from the one registry above rather than a literal copied
 * into every route. A fork adds its city in one place; every `?city=` endpoint
 * follows.
 */
export const CITY_IDS = Object.keys(cityDataById) as CityId[];

/** Narrows an arbitrary `?city=` value to a known city, or null. */
export function parseCityId(value: unknown): CityId | null {
  return typeof value === 'string' && (CITY_IDS as string[]).includes(value)
    ? (value as CityId)
    : null;
}

export type { CityData, CityId } from './types';

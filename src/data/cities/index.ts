import { activeCityId } from '@/config/map.config';
import { bendData } from './bend';
import { chattanoogaData } from './chattanooga';
import type { CityData, CityId } from './types';

export const cityDataById: Record<CityId, CityData> = {
  chattanooga: chattanoogaData,
  bend: bendData,
};

export const activeCityData = cityDataById[activeCityId];

export type { CityData, CityId } from './types';

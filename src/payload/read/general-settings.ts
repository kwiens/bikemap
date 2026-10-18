import 'server-only';

import { getPayload } from 'payload';
import config from '@payload-config';
import {
  DEFAULT_FEATURE_SETTINGS,
  type FeatureSettings,
} from '@/config/features.config';

export async function getGeneralSettings(): Promise<FeatureSettings> {
  if (!process.env.DATABASE_URL) return DEFAULT_FEATURE_SETTINGS;

  try {
    const payload = await getPayload({ config });
    const settings = await payload.findGlobal({
      slug: 'general-settings',
      depth: 0,
    });

    return {
      attractions: settings.attractions !== false,
      bikeNetwork: settings.bikeNetwork !== false,
      bikeRentals: settings.bikeRentals !== false,
      bikeResources: settings.bikeResources !== false,
      casualRoutes: settings.casualRoutes !== false,
      conditionReporting: settings.conditionReporting !== false,
      embeds: settings.embeds !== false,
      nationwideTrails: settings.nationwideTrails !== false,
      rideRecording: settings.rideRecording !== false,
    };
  } catch (error) {
    console.error('Could not read general settings; using defaults.', error);
    return DEFAULT_FEATURE_SETTINGS;
  }
}

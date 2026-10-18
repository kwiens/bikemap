import { describe, expect, it } from 'vitest';
import { GeneralSettings } from './GeneralSettings';

describe('GeneralSettings global', () => {
  it('offers every supported feature switch except trail stewards', () => {
    const checkboxes = GeneralSettings.fields
      .filter((field) => field.type === 'checkbox')
      .map((field) => ('name' in field ? field.name : null));

    expect(checkboxes).toEqual([
      'casualRoutes',
      'conditionReporting',
      'rideRecording',
      'nationwideTrails',
      'bikeNetwork',
      'attractions',
      'bikeResources',
      'bikeRentals',
      'embeds',
    ]);
    expect(checkboxes).not.toContain('trailStewardsEnabled');
  });
});

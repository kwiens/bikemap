import type { GlobalConfig } from 'payload';

/** Optional public-site features. Trail stewards are intentionally not here. */
export const GeneralSettings: GlobalConfig = {
  slug: 'general-settings',
  label: 'General settings',
  admin: {
    description: 'Turn optional public-site features on or off.',
    group: 'Settings',
  },
  access: {
    read: ({ req }) => Boolean(req.user),
    update: ({ req }) => req.user?.role === 'admin',
  },
  fields: [
    featureField(
      'casualRoutes',
      'Casual routes',
      'Show the Casual tab and its curated route options.',
    ),
    featureField(
      'conditionReporting',
      'Trail conditions',
      'Show trail-condition reports and let riders submit new reports.',
    ),
    {
      name: 'conditionReportingDisabledMessage',
      type: 'textarea',
      label: 'Why trail conditions are off (shown to riders)',
      admin: {
        condition: (data) => data?.conditionReporting === false,
        description:
          'Optional, e.g. “Conditions are reported on our forum instead.”',
      },
    },
    featureField(
      'rideRecording',
      'Ride recording',
      'Show ride recording controls and saved ride history.',
    ),
    featureField(
      'nationwideTrails',
      'Nationwide OSM trails',
      'Offer the nationwide OpenStreetMap trail overlay.',
    ),
    featureField(
      'bikeNetwork',
      'Bike network',
      'Offer the classified bike-network overlay.',
    ),
    featureField(
      'attractions',
      'Attractions',
      'Show the attractions layer and location list.',
    ),
    featureField(
      'bikeResources',
      'Bike resources',
      'Show bike shops, repair locations, and other cycling resources.',
    ),
    featureField(
      'bikeRentals',
      'Bike rentals and bike share',
      'Offer live bike-share stations or free-floating bikes where configured.',
    ),
    featureField(
      'embeds',
      'Embeds',
      'Serve the embeddable map and show the embed builder.',
    ),
  ],
};

function featureField(name: string, label: string, description: string) {
  return {
    name,
    type: 'checkbox' as const,
    defaultValue: true,
    label,
    admin: { description },
  };
}

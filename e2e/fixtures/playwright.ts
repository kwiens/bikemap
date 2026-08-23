import {
  expect,
  test as base,
  type BrowserContext,
  type Page,
} from '@playwright/test';
import { bikeRoutes } from '@/data/geo_data';

export interface MockGeolocationPoint {
  longitude: number;
  latitude: number;
  altitude?: number | null;
  accuracy?: number;
  altitudeAccuracy?: number | null;
  heading?: number | null;
  speed?: number | null;
  timestamp?: number;
}

interface AutomaticFixtures {
  applicationErrorMonitor: undefined;
  deterministicBrowser: undefined;
}

export const test = base.extend<AutomaticFixtures>({
  deterministicBrowser: [
    async ({ context, baseURL }, use) => {
      await installDeterministicBrowser(context, baseURL);
      await use(undefined);
    },
    { auto: true },
  ],

  applicationErrorMonitor: [
    async ({ page, baseURL }, use, testInfo) => {
      const issues: string[] = [];
      const applicationOrigin = baseURL ? new URL(baseURL).origin : null;

      page.on('console', (message) => {
        if (message.type() === 'error') {
          issues.push(`console error: ${message.text()}`);
        }
      });
      page.on('pageerror', (error) => {
        issues.push(`uncaught page error: ${error.message}`);
      });
      page.on('requestfailed', (request) => {
        if (
          isApplicationUrl(request.url(), applicationOrigin) &&
          !request.failure()?.errorText.includes('ERR_ABORTED')
        ) {
          issues.push(
            `failed request: ${request.method()} ${request.url()} (${request.failure()?.errorText ?? 'unknown error'})`,
          );
        }
      });
      page.on('response', (response) => {
        if (
          response.status() >= 400 &&
          isApplicationUrl(response.url(), applicationOrigin)
        ) {
          issues.push(
            `HTTP ${response.status()}: ${response.request().method()} ${response.url()}`,
          );
        }
      });

      await use(undefined);

      if (issues.length > 0) {
        await testInfo.attach('application-errors', {
          body: issues.join('\n'),
          contentType: 'text/plain',
        });
      }
      expect(issues, 'unexpected browser or application errors').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

export async function openMap(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByText('Loading map...')).toHaveCount(0, {
    timeout: 30_000,
  });
  await page.waitForFunction(
    () => (window as unknown as Record<string, unknown>).__mapReady === true,
    undefined,
    { timeout: 45_000 },
  );
}

export async function setMockGeolocation(
  page: Page,
  point: MockGeolocationPoint,
): Promise<void> {
  await page.evaluate((nextPoint) => {
    const setter = (
      window as unknown as {
        __e2eSetGeolocation?: (value: MockGeolocationPoint) => void;
      }
    ).__e2eSetGeolocation;
    if (!setter) throw new Error('Mock geolocation was not installed.');
    setter(nextPoint);
  }, point);
}

async function installDeterministicBrowser(
  context: BrowserContext,
  baseURL: string | undefined,
): Promise<void> {
  await installDeterministicMapbox(context, baseURL);

  if (baseURL) {
    const url = new URL(baseURL);
    await context.addCookies([
      {
        name: 'bikechatt-settings',
        value: encodeURIComponent(
          JSON.stringify({
            rideStyle: 'mountain',
            sidebarOpen: true,
            activeTab: 'trails',
          }),
        ),
        domain: url.hostname,
        path: '/',
      },
    ]);
  }

  await context.addInitScript(() => {
    localStorage.setItem('bikechatt-welcome-dismissed', '1');

    let current: MockGeolocationPoint = {
      longitude: -85.306739,
      latitude: 35.059623,
      altitude: 210,
      accuracy: 5,
      altitudeAccuracy: 5,
      heading: 0,
      speed: 4,
      timestamp: Date.now(),
    };
    let nextWatchId = 1;
    const watchers = new Map<number, PositionCallback>();

    function asPosition(point: MockGeolocationPoint): GeolocationPosition {
      const coords: GeolocationCoordinates = {
        longitude: point.longitude,
        latitude: point.latitude,
        altitude: point.altitude ?? null,
        accuracy: point.accuracy ?? 5,
        altitudeAccuracy: point.altitudeAccuracy ?? 5,
        heading: point.heading ?? 0,
        speed: point.speed ?? 4,
        toJSON() {
          return {
            longitude: this.longitude,
            latitude: this.latitude,
            altitude: this.altitude,
            accuracy: this.accuracy,
            altitudeAccuracy: this.altitudeAccuracy,
            heading: this.heading,
            speed: this.speed,
          };
        },
      };
      return {
        coords,
        timestamp: point.timestamp ?? Date.now(),
        toJSON() {
          return {
            coords: this.coords.toJSON(),
            timestamp: this.timestamp,
          };
        },
      };
    }

    const geolocation: Geolocation = {
      clearWatch(watchId) {
        watchers.delete(watchId);
      },
      getCurrentPosition(success) {
        queueMicrotask(() => success(asPosition(current)));
      },
      watchPosition(success) {
        const watchId = nextWatchId++;
        watchers.set(watchId, success);
        queueMicrotask(() => success(asPosition(current)));
        return watchId;
      },
    };

    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: geolocation,
    });
    Object.defineProperty(window, '__e2eSetGeolocation', {
      configurable: true,
      value: (nextPoint: MockGeolocationPoint) => {
        current = { ...current, ...nextPoint };
        const position = asPosition(current);
        for (const callback of watchers.values()) {
          queueMicrotask(() => callback(position));
        }
      },
    });
  });
}

async function installDeterministicMapbox(
  context: BrowserContext,
  baseURL: string | undefined,
): Promise<void> {
  await context.route('https://events.mapbox.com/**', (route) =>
    route.fulfill({ status: 204 }),
  );
  await context.route('https://api.mapbox.com/**', (route) => {
    const url = new URL(route.request().url());

    if (url.pathname.includes('/styles/v1/')) {
      return route.fulfill({
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify({
          version: 8,
          name: 'Playwright map style',
          glyphs: `${baseURL}/__e2e/glyphs/{fontstack}/{range}.pbf`,
          sources: {
            'e2e-routes': {
              type: 'geojson',
              data: {
                type: 'FeatureCollection',
                features: [],
              },
            },
          },
          layers: [
            {
              id: 'background',
              type: 'background',
              paint: { 'background-color': '#eef2f7' },
            },
            ...bikeRoutes.map((route) => ({
              id: route.id,
              type: 'line',
              source: 'e2e-routes',
              paint: {
                'line-color': route.color,
                'line-opacity': 0.5,
                'line-width': 3,
              },
            })),
          ],
        }),
      });
    }

    if (url.pathname.endsWith('/v4/swuller.ccfw1cmr.json')) {
      return route.fulfill({
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify({
          tilejson: '2.2.0',
          name: 'Playwright MTB trails',
          minzoom: 24,
          maxzoom: 24,
          tiles: [`${baseURL}/__e2e/empty/{z}/{x}/{y}.mvt`],
          vector_layers: [
            {
              id: 'Chattanooga_Regional_Trails_4-dhs2zs',
              fields: { Trail: 'String' },
              minzoom: 24,
              maxzoom: 24,
            },
          ],
        }),
      });
    }

    if (url.pathname.includes('/map-sessions/')) {
      return route.fulfill({ status: 204 });
    }

    return route.abort('blockedbyclient');
  });
  await context.route(
    'https://tiles.openstreetmap.us/vector/trails.json',
    (route) =>
      route.fulfill({
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify({
          tilejson: '2.2.0',
          name: 'Playwright OSM trails',
          minzoom: 24,
          maxzoom: 24,
          tiles: [`${baseURL}/__e2e/empty/{z}/{x}/{y}.mvt`],
          vector_layers: [
            { id: 'trail', fields: {}, minzoom: 24, maxzoom: 24 },
            { id: 'trail_poi', fields: {}, minzoom: 24, maxzoom: 24 },
          ],
        }),
      }),
  );
  await context.route('**/__e2e/empty/**', (route) =>
    route.fulfill({
      contentType: 'application/vnd.mapbox-vector-tile',
      body: Buffer.alloc(0),
    }),
  );
  await context.route('**/__e2e/glyphs/**', (route) =>
    route.fulfill({
      contentType: 'application/x-protobuf',
      body: Buffer.alloc(0),
    }),
  );
}

function isApplicationUrl(
  url: string,
  applicationOrigin: string | null,
): boolean {
  if (!applicationOrigin) return false;

  try {
    return new URL(url).origin === applicationOrigin;
  } catch {
    return false;
  }
}

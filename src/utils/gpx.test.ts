import { describe, it, expect } from 'vitest';
import { buildGpx, buildRideGpx, type GpxRoute } from './gpx';
import { parseGpxToRidePoints } from './gpx-parser';
import { mockStoredRidePoint } from '@/test/fixtures';

function lineStringFeature(
  coords: [number, number][],
): GeoJSON.Feature<GeoJSON.LineString> {
  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'LineString', coordinates: coords },
  };
}

function multiLineStringFeature(
  lines: [number, number][][],
): GeoJSON.Feature<GeoJSON.MultiLineString> {
  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'MultiLineString', coordinates: lines },
  };
}

describe('buildGpx', () => {
  it('returns null for empty routes array', () => {
    expect(buildGpx([])).toBeNull();
  });

  it('returns null when route has no LineString/MultiLineString features', () => {
    const route: GpxRoute = {
      name: 'Test',
      description: 'Desc',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: { type: 'Point', coordinates: [-85, 35] },
        },
      ],
    };
    expect(buildGpx([route])).toBeNull();
  });

  it('generates valid GPX for a single route with LineString', () => {
    const route: GpxRoute = {
      name: 'River Loop',
      description: 'A scenic loop',
      features: [
        lineStringFeature([
          [-85.3, 35.0],
          [-85.31, 35.01],
          [-85.32, 35.02],
        ]),
      ],
    };
    const gpx = buildGpx([route]);
    expect(gpx).not.toBeNull();
    expect(gpx).toContain('<?xml version="1.0"');
    expect(gpx).toContain('<gpx xmlns=');
    expect(gpx).toContain('<name>River Loop</name>');
    expect(gpx).toContain('<desc>A scenic loop</desc>');
    expect(gpx).toContain('<trk>');
    expect(gpx).toContain('<trkseg>');
    expect(gpx).toContain('lat="35" lon="-85.3"');
    expect(gpx).toContain('lat="35.01" lon="-85.31"');
  });

  it('generates multiple trkseg for MultiLineString', () => {
    const route: GpxRoute = {
      name: 'Multi',
      description: 'Multi segment',
      features: [
        multiLineStringFeature([
          [
            [-85.3, 35.0],
            [-85.31, 35.01],
          ],
          [
            [-85.32, 35.02],
            [-85.33, 35.03],
          ],
        ]),
      ],
    };
    const gpx = buildGpx([route]) as string;
    const segments = gpx.match(/<trkseg>/g);
    expect(segments).toHaveLength(2);
  });

  it('generates multiple trk for multiple routes', () => {
    const routes: GpxRoute[] = [
      {
        name: 'Route A',
        description: 'First',
        features: [
          lineStringFeature([
            [-85.3, 35.0],
            [-85.31, 35.01],
          ]),
        ],
      },
      {
        name: 'Route B',
        description: 'Second',
        features: [
          lineStringFeature([
            [-85.4, 35.1],
            [-85.41, 35.11],
          ]),
        ],
      },
    ];
    const gpx = buildGpx(routes) as string;
    const tracks = gpx.match(/<trk>/g);
    expect(tracks).toHaveLength(2);
    expect(gpx).toContain('<name>Chattanooga Bike Routes</name>');
  });

  it('uses route name as metadata for single route', () => {
    const route: GpxRoute = {
      name: 'Solo Route',
      description: 'Only one',
      features: [
        lineStringFeature([
          [-85.3, 35.0],
          [-85.31, 35.01],
        ]),
      ],
    };
    const gpx = buildGpx([route]) as string;
    // Metadata name should be the route name, not the multi-route default
    const metadataMatch = gpx.match(/<metadata>\s*<name>(.*?)<\/name>/s);
    expect(metadataMatch?.[1]).toBe('Solo Route');
  });

  it('escapes XML special characters in route names', () => {
    const route: GpxRoute = {
      name: 'Trail & <Loop> "Test"',
      description: "It's a test",
      features: [
        lineStringFeature([
          [-85.3, 35.0],
          [-85.31, 35.01],
        ]),
      ],
    };
    const gpx = buildGpx([route]) as string;
    expect(gpx).toContain('&amp;');
    expect(gpx).toContain('&lt;Loop&gt;');
    expect(gpx).toContain('&quot;Test&quot;');
    expect(gpx).toContain('&apos;s a test');
  });
});

describe('buildRideGpx', () => {
  it('includes elevation element when altitude is present', () => {
    const gpx = buildRideGpx({
      name: 'Test Ride',
      points: [mockStoredRidePoint({ altitude: 200.5 })],
    });
    expect(gpx).toContain('<ele>200.5</ele>');
  });

  it('omits elevation element when altitude is null', () => {
    const gpx = buildRideGpx({
      name: 'Test Ride',
      points: [mockStoredRidePoint({ altitude: null })],
    });
    expect(gpx).not.toContain('<ele>');
  });

  it('formats timestamps as ISO 8601', () => {
    const ts = new Date('2026-01-15T10:00:00Z').getTime();
    const gpx = buildRideGpx({
      name: 'Test Ride',
      points: [mockStoredRidePoint({ timestamp: ts })],
    });
    expect(gpx).toContain('<time>2026-01-15T10:00:00.000Z</time>');
  });

  it('round-trips through parser', () => {
    const points = [
      mockStoredRidePoint({
        lat: 35.0,
        lng: -85.3,
        altitude: 200,
        timestamp: new Date('2026-01-15T10:00:00Z').getTime(),
      }),
      mockStoredRidePoint({
        lat: 35.01,
        lng: -85.31,
        altitude: 210,
        timestamp: new Date('2026-01-15T10:01:00Z').getTime(),
      }),
    ];
    const gpx = buildRideGpx({ name: 'Round Trip', points });
    const parsed = parseGpxToRidePoints(gpx);

    expect(parsed).toHaveLength(2);
    expect(parsed[0].lat).toBe(35.0);
    expect(parsed[0].lng).toBe(-85.3);
    expect(parsed[0].altitude).toBe(200.0);
    expect(parsed[1].lat).toBe(35.01);
    expect(parsed[1].lng).toBe(-85.31);
  });
});

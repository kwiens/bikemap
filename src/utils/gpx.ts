// GPX 1.1 generation from GeoJSON features and recorded rides
// Spec: https://www.topografix.com/gpx/1/1/

import type { StoredRidePoint } from '../data/ride';

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function extractSegments(features: GeoJSON.Feature[]): GeoJSON.Position[][] {
  const segments: GeoJSON.Position[][] = [];
  for (const feature of features) {
    const geom = feature.geometry;
    if (geom.type === 'LineString') {
      segments.push(geom.coordinates);
    } else if (geom.type === 'MultiLineString') {
      for (const line of geom.coordinates) {
        segments.push(line);
      }
    }
  }
  return segments;
}

function buildTrack(
  name: string,
  description: string,
  segments: GeoJSON.Position[][],
): string {
  const trksegs = segments
    .map((seg) => {
      const trkpts = seg
        .map(
          (coord) =>
            `      <trkpt lat="${coord[1]}" lon="${coord[0]}"></trkpt>`,
        )
        .join('\n');
      return `    <trkseg>\n${trkpts}\n    </trkseg>`;
    })
    .join('\n');

  return `  <trk>
    <name>${escapeXml(name)}</name>
    <desc>${escapeXml(description)}</desc>
${trksegs}
  </trk>`;
}

export interface GpxRoute {
  name: string;
  description: string;
  features: GeoJSON.Feature[];
}

export interface RideGpxInput {
  name: string;
  points: StoredRidePoint[];
}

export function buildRideGpx(input: RideGpxInput): string {
  const trkpts = input.points
    .map((p) => {
      const children: string[] = [];
      if (p.altitude !== null) {
        children.push(`        <ele>${p.altitude.toFixed(1)}</ele>`);
      }
      children.push(
        `        <time>${new Date(p.timestamp).toISOString()}</time>`,
      );
      return `      <trkpt lat="${p.lat}" lon="${p.lng}">\n${children.join('\n')}\n      </trkpt>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx xmlns="http://www.topografix.com/GPX/1/1"
     xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
     xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd"
     version="1.1"
     creator="Bike Chattanooga">
  <metadata>
    <name>${escapeXml(input.name)}</name>
  </metadata>
  <trk>
    <name>${escapeXml(input.name)}</name>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>`;
}

export function buildGpx(routes: GpxRoute[]): string | null {
  const tracks: string[] = [];

  for (const route of routes) {
    const segments = extractSegments(route.features);
    if (segments.length === 0) continue;
    tracks.push(buildTrack(route.name, route.description, segments));
  }

  if (tracks.length === 0) return null;

  const metaName =
    routes.length === 1 ? routes[0].name : 'Chattanooga Bike Routes';
  const metaDesc =
    routes.length === 1
      ? routes[0].description
      : 'All bike routes in Chattanooga, TN';

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx xmlns="http://www.topografix.com/GPX/1/1"
     xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
     xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd"
     version="1.1"
     creator="Bike Chattanooga">
  <metadata>
    <name>${escapeXml(metaName)}</name>
    <desc>${escapeXml(metaDesc)}</desc>
  </metadata>
${tracks.join('\n')}
</gpx>`;
}

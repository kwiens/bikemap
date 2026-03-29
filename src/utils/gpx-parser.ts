// Parse GPX XML into RidePoint arrays — counterpart to buildRideGpx in gpx.ts

import type { RidePoint } from '../data/ride';

export function parseGpxToRidePoints(gpxXml: string): RidePoint[] {
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(gpxXml, 'application/xml');
  } catch {
    return [];
  }

  // Check for parse error
  if (doc.querySelector('parsererror')) return [];

  const trkpts = doc.getElementsByTagName('trkpt');
  if (trkpts.length === 0) return [];

  // First pass: check if any trkpt has a <time> element
  let hasAnyTime = false;
  for (let i = 0; i < trkpts.length; i++) {
    if (trkpts[i].getElementsByTagName('time').length > 0) {
      hasAnyTime = true;
      break;
    }
  }

  const baseTime = Date.now();
  const points: RidePoint[] = [];

  for (let i = 0; i < trkpts.length; i++) {
    const el = trkpts[i];
    const lat = Number.parseFloat(el.getAttribute('lat') ?? '');
    const lon = Number.parseFloat(el.getAttribute('lon') ?? '');
    if (Number.isNaN(lat) || Number.isNaN(lon)) continue;

    const eleEl = el.getElementsByTagName('ele')[0];
    const altitude = eleEl ? Number.parseFloat(eleEl.textContent ?? '') : null;

    let timestamp: number;
    if (hasAnyTime) {
      const timeEl = el.getElementsByTagName('time')[0];
      timestamp = timeEl
        ? new Date(timeEl.textContent ?? '').getTime()
        : baseTime + i * 1000;
    } else {
      timestamp = baseTime + i * 1000;
    }

    points.push({
      lng: lon,
      lat,
      altitude: altitude !== null && !Number.isNaN(altitude) ? altitude : null,
      accuracy: 5,
      speed: null,
      timestamp,
    });
  }

  return points;
}

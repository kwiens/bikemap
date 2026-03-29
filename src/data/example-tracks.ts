// Example ride tracks for the /test page — realistic Chattanooga routes

import type { RidePoint } from './ride';
import { haversineDistance } from '../utils/ride-stats';

export interface ExampleTrack {
  name: string;
  description: string;
  waypoints: [number, number, number][]; // [lng, lat, altitude_meters]
}

/**
 * Convert raw waypoints to a RidePoint array with synthesized timestamps,
 * speed, and accuracy values.
 */
export function waypointsToRidePoints(
  waypoints: [number, number, number][],
  options?: { startTime?: number; intervalMs?: number; baseAccuracy?: number },
): RidePoint[] {
  const startTime = options?.startTime ?? Date.now() - waypoints.length * 1000;
  const intervalMs = options?.intervalMs ?? 1000;
  const baseAccuracy = options?.baseAccuracy ?? 7;

  return waypoints.map(([lng, lat, altitude], i) => {
    let speed: number | null = null;
    if (i > 0) {
      const d = haversineDistance(
        waypoints[i - 1][1],
        waypoints[i - 1][0],
        lat,
        lng,
      );
      speed = d / (intervalMs / 1000);
    }

    return {
      lng,
      lat,
      altitude,
      accuracy: baseAccuracy + ((i % 3) - 1), // deterministic variation: 6, 7, 8, 6, 7, 8...
      speed,
      timestamp: startTime + i * intervalMs,
    };
  });
}

// --- Jitter ---

// Deterministic GPS jitter to simulate a real recording wandering off the track.
// Uses a simple seeded pattern — no randomness so tests are reproducible.
const JITTER_LNG = [
  0.00004, -0.00006, 0.00008, -0.00003, 0.00007, -0.00005, 0.00002, -0.00009,
  0.00006, -0.00004, 0.00003, -0.00007, 0.00009, -0.00002, 0.00005, -0.00008,
  0.00001, -0.00006, 0.00004, -0.00003,
];
const JITTER_LAT = [
  -0.00005, 0.00007, -0.00003, 0.00006, -0.00008, 0.00004, -0.00002, 0.00009,
  -0.00006, 0.00005, -0.00007, 0.00003, -0.00004, 0.00008, -0.00001, 0.00006,
  -0.00009, 0.00002, -0.00005, 0.00007,
];
const JITTER_ALT = [
  0.3, -0.5, 0.8, -0.2, 0.6, -0.7, 0.4, -0.3, 0.9, -0.6, 0.2, -0.8, 0.5, -0.4,
  0.7, -0.1, 0.3, -0.9, 0.6, -0.5,
];

function jitter(
  waypoints: [number, number, number][],
): [number, number, number][] {
  return waypoints.map(([lng, lat, alt], i) => [
    lng + JITTER_LNG[i % JITTER_LNG.length],
    lat + JITTER_LAT[i % JITTER_LAT.length],
    alt + JITTER_ALT[i % JITTER_ALT.length],
  ]);
}

// Feet → meters for elevation values sourced from elevation profile JSON files
const FT_TO_M = 0.3048;

// --- Example Tracks ---
// Coordinates sampled from real elevation profiles with GPS jitter applied.

export const EXAMPLE_TRACKS: ExampleTrack[] = [
  {
    name: 'Zoo Loop',
    description:
      'Road ride through UTC campus past the zoo. Moderate traffic, rolling hills.',
    waypoints: jitter([
      [-85.306413, 35.049743, 728 * FT_TO_M],
      [-85.307285, 35.052226, 710 * FT_TO_M],
      [-85.306679, 35.055547, 718 * FT_TO_M],
      [-85.306073, 35.058868, 634 * FT_TO_M],
      [-85.304533, 35.061624, 661 * FT_TO_M],
      [-85.301934, 35.060074, 652 * FT_TO_M],
      [-85.302759, 35.056784, 652 * FT_TO_M],
      [-85.304333, 35.053855, 705 * FT_TO_M],
      [-85.307608, 35.054615, 716 * FT_TO_M],
      [-85.30751, 35.051258, 741 * FT_TO_M],
      [-85.305497, 35.04992, 719 * FT_TO_M],
      [-85.301777, 35.048506, 709 * FT_TO_M],
      [-85.298057, 35.047092, 719 * FT_TO_M],
      [-85.294336, 35.045678, 759 * FT_TO_M],
      [-85.290616, 35.044264, 740 * FT_TO_M],
      [-85.290484, 35.041756, 698 * FT_TO_M],
      [-85.286747, 35.040373, 659 * FT_TO_M],
      [-85.283978, 35.040957, 661 * FT_TO_M],
      [-85.281377, 35.042763, 663 * FT_TO_M],
      [-85.283834, 35.04086, 661 * FT_TO_M],
      [-85.286062, 35.038113, 673 * FT_TO_M],
      [-85.289296, 35.038823, 660 * FT_TO_M],
      [-85.293067, 35.040142, 723 * FT_TO_M],
      [-85.294483, 35.042235, 714 * FT_TO_M],
      [-85.298041, 35.043677, 699 * FT_TO_M],
      [-85.296147, 35.046141, 723 * FT_TO_M],
      [-85.296092, 35.046335, 720 * FT_TO_M],
    ]),
  },
  {
    name: 'Walden Ridge MTB',
    description:
      'Mountain bike run: Walden Falls → Thrasher → Bullwinkle descent',
    waypoints: jitter([
      // Walden Falls
      [-85.31225, 35.145407, 1394 * FT_TO_M],
      [-85.31225, 35.145133, 1375 * FT_TO_M],
      [-85.312119, 35.144993, 1356 * FT_TO_M],
      [-85.311793, 35.145055, 1330 * FT_TO_M],
      [-85.311578, 35.144976, 1310 * FT_TO_M],
      [-85.31156, 35.144731, 1302 * FT_TO_M],
      [-85.311884, 35.144662, 1319 * FT_TO_M],
      [-85.312094, 35.144512, 1323 * FT_TO_M],
      [-85.312016, 35.144335, 1309 * FT_TO_M],
      [-85.312146, 35.144166, 1319 * FT_TO_M],
      [-85.312307, 35.144052, 1337 * FT_TO_M],
      [-85.312169, 35.143802, 1336 * FT_TO_M],
      [-85.312252, 35.143539, 1366 * FT_TO_M],
      [-85.312475, 35.143384, 1392 * FT_TO_M],
      [-85.312799, 35.143314, 1414 * FT_TO_M],
      [-85.312936, 35.143284, 1421 * FT_TO_M],
      // Thrasher
      [-85.312765, 35.141546, 1390 * FT_TO_M],
      [-85.312698, 35.141189, 1368 * FT_TO_M],
      [-85.312309, 35.141418, 1348 * FT_TO_M],
      [-85.312047, 35.141765, 1328 * FT_TO_M],
      [-85.311698, 35.142019, 1315 * FT_TO_M],
      [-85.311554, 35.14163, 1301 * FT_TO_M],
      [-85.311415, 35.141235, 1285 * FT_TO_M],
      [-85.311101, 35.14128, 1264 * FT_TO_M],
      [-85.31075, 35.141568, 1241 * FT_TO_M],
      [-85.310458, 35.141903, 1213 * FT_TO_M],
      [-85.310207, 35.141571, 1187 * FT_TO_M],
      [-85.310224, 35.141214, 1181 * FT_TO_M],
      [-85.310058, 35.140906, 1150 * FT_TO_M],
      [-85.309654, 35.141129, 1120 * FT_TO_M],
      [-85.30961, 35.14116, 1115 * FT_TO_M],
      // Bullwinkle
      [-85.310125, 35.139967, 1081 * FT_TO_M],
      [-85.309956, 35.139654, 1065 * FT_TO_M],
      [-85.309787, 35.13934, 1051 * FT_TO_M],
      [-85.309794, 35.139019, 1048 * FT_TO_M],
      [-85.3099, 35.138693, 1040 * FT_TO_M],
      [-85.309707, 35.138401, 1008 * FT_TO_M],
      [-85.309406, 35.138163, 976 * FT_TO_M],
      [-85.309099, 35.138075, 958 * FT_TO_M],
      [-85.308806, 35.138108, 930 * FT_TO_M],
      [-85.308577, 35.13814, 909 * FT_TO_M],
      [-85.308434, 35.137818, 906 * FT_TO_M],
      [-85.308215, 35.137634, 885 * FT_TO_M],
      [-85.308131, 35.137346, 869 * FT_TO_M],
      [-85.307872, 35.137107, 844 * FT_TO_M],
    ]),
  },
];

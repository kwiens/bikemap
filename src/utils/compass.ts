/** Velocity-aware compass heading smoother.
 *
 * At riding speed (≥ GPS_SPEED_THRESHOLD m/s) the GPS course-over-ground is
 * used directly — it's immune to magnetic interference from bike frames,
 * cars, etc.  At low speed / stationary, an adaptive-rate low-pass filter
 * on the magnetometer kicks in: small deltas (jitter) get heavy filtering,
 * large deltas (real turns) pass through quickly.
 */

// Speed threshold (m/s) above which GPS heading is preferred (~7 mph)
const GPS_SPEED_THRESHOLD = 3;

// Adaptive low-pass: alpha scales linearly from MIN → MAX as the angular
// delta grows from 0 → TURN_DEGREES.
const ALPHA_MIN = 0.05;
const ALPHA_MAX = 0.5;
const TURN_DEGREES = 30;

/** Shortest signed angular delta, always in (−180, 180]. */
export function shortestDelta(from: number, to: number): number {
  let d = to - from;
  if (d > 180) d -= 360;
  else if (d < -180) d += 360;
  return d;
}

export interface GpsReading {
  heading: number;
  speed: number;
}

export class HeadingSmoother {
  private smoothed: number | null = null;

  /** Return the current smoothed heading (null before any readings). */
  get heading(): number | null {
    return this.smoothed;
  }

  /** Reset to initial state. */
  reset(): void {
    this.smoothed = null;
  }

  /**
   * Feed a new reading and get the updated smoothed heading.
   *
   * @param compassDeg  Raw magnetometer heading in degrees (0–360), or null
   *                    if no compass reading is available this tick.
   * @param gps         GPS heading + speed, or null if unavailable.
   * @returns           The smoothed heading, or null if no valid input yet.
   */
  update(compassDeg: number | null, gps: GpsReading | null): number | null {
    // Prefer GPS heading when moving fast enough
    if (gps && gps.speed >= GPS_SPEED_THRESHOLD) {
      this.smoothed = gps.heading;
      return this.smoothed;
    }

    // Fall back to magnetometer with adaptive-rate smoothing
    if (compassDeg === null) return this.smoothed;

    if (this.smoothed === null) {
      this.smoothed = compassDeg;
    } else {
      const delta = shortestDelta(this.smoothed, compassDeg);
      const t = Math.min(Math.abs(delta) / TURN_DEGREES, 1);
      const alpha = ALPHA_MIN + (ALPHA_MAX - ALPHA_MIN) * t;
      this.smoothed = (this.smoothed + alpha * delta + 360) % 360;
    }

    return this.smoothed;
  }
}

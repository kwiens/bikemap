import { describe, it, expect, beforeEach } from 'vitest';
import { shortestDelta, HeadingSmoother } from './compass';

describe('shortestDelta', () => {
  it('returns positive delta for small clockwise change', () => {
    expect(shortestDelta(10, 20)).toBe(10);
  });

  it('returns negative delta for small counter-clockwise change', () => {
    expect(shortestDelta(20, 10)).toBe(-10);
  });

  it('wraps clockwise across 360/0 boundary', () => {
    // 350 → 10 should be +20, not -340
    expect(shortestDelta(350, 10)).toBe(20);
  });

  it('wraps counter-clockwise across 360/0 boundary', () => {
    // 10 → 350 should be -20, not +340
    expect(shortestDelta(10, 350)).toBe(-20);
  });

  it('returns 180 for opposite directions', () => {
    expect(Math.abs(shortestDelta(0, 180))).toBe(180);
  });

  it('returns 0 for identical headings', () => {
    expect(shortestDelta(90, 90)).toBe(0);
  });
});

describe('HeadingSmoother', () => {
  let smoother: HeadingSmoother;

  beforeEach(() => {
    smoother = new HeadingSmoother();
  });

  describe('initial state', () => {
    it('returns null before any readings', () => {
      expect(smoother.heading).toBeNull();
    });

    it('returns null when fed null compass with no GPS', () => {
      expect(smoother.update(null, null)).toBeNull();
    });

    it('accepts first compass reading directly', () => {
      expect(smoother.update(90, null)).toBe(90);
      expect(smoother.heading).toBe(90);
    });
  });

  describe('GPS override', () => {
    it('uses GPS heading when speed >= 3 m/s', () => {
      // Prime with a compass reading first
      smoother.update(90, null);

      const result = smoother.update(90, { heading: 180, speed: 5 });
      expect(result).toBe(180);
    });

    it('uses GPS heading at exactly 3 m/s threshold', () => {
      smoother.update(0, null);
      expect(smoother.update(0, { heading: 45, speed: 3 })).toBe(45);
    });

    it('ignores GPS when speed is below threshold', () => {
      smoother.update(90, null);
      const result = smoother.update(91, { heading: 270, speed: 2 });
      // Should use compass (91°), not GPS (270°)
      expect(result).not.toBe(270);
    });

    it('switches between GPS and compass as speed changes', () => {
      smoother.update(90, null);

      // Riding: GPS takes over
      smoother.update(90, { heading: 180, speed: 5 });
      expect(smoother.heading).toBe(180);

      // Stopped: compass resumes with smoothing from 180
      const result = smoother.update(185, { heading: 0, speed: 1 });
      // Should smooth toward 185 from 180, not jump to GPS heading 0
      expect(result).toBeGreaterThan(180);
      expect(result).toBeLessThan(185);
    });
  });

  describe('adaptive-rate smoothing', () => {
    it('filters small jitter heavily (low alpha)', () => {
      smoother.update(100, null);

      // Feed a 2° jitter spike
      const result = smoother.update(102, null);
      // With alpha ≈ 0.05 + (0.45 * 2/30) ≈ 0.08, should move < 1°
      expect(result).toBeGreaterThan(100);
      expect(result).toBeLessThan(101);
    });

    it('responds quickly to large turns (high alpha)', () => {
      smoother.update(100, null);

      // Feed a 40° turn (above TURN_DEGREES=30, so alpha clamped to 0.5)
      const result = smoother.update(140, null);
      // Should move ~20° (0.5 * 40)
      expect(result).toBeGreaterThan(115);
      expect(result).toBeLessThan(125);
    });

    it('converges toward target over multiple readings', () => {
      smoother.update(0, null);

      // Sustained 90° turn: feed the same target repeatedly
      for (let i = 0; i < 30; i++) {
        smoother.update(90, null);
      }

      // After 30 readings, should be very close to 90
      const heading = smoother.heading!;
      expect(heading).toBeGreaterThan(85);
      expect(heading).toBeLessThan(95);
    });

    it('suppresses random jitter around a steady heading', () => {
      smoother.update(180, null);

      // Simulate noisy sensor: ±3° random noise around 180
      const jitterReadings = [182, 178, 183, 177, 181, 179, 182, 178];
      for (const reading of jitterReadings) {
        smoother.update(reading, null);
      }

      // Should stay close to 180 despite noise
      const heading = smoother.heading!;
      expect(heading).toBeGreaterThan(178);
      expect(heading).toBeLessThan(182);
    });
  });

  describe('wraparound', () => {
    it('smooths correctly across the 360/0 boundary going clockwise', () => {
      smoother.update(355, null);
      const result = smoother.update(5, null);
      // Should move clockwise (increase past 360), not counter-clockwise
      expect(result).toBeGreaterThan(355);
      // Normalize: could be > 360 internally but modulo keeps it in range
      expect(result).toBeLessThan(360);
    });

    it('smooths correctly across the 360/0 boundary going counter-clockwise', () => {
      smoother.update(5, null);
      const result = smoother.update(355, null);
      // Should move counter-clockwise (decrease past 0)
      // The smoothed value wraps to near 360
      expect(result).toBeLessThan(5);
      // It should be a small number near 0, or near 360
      expect(result >= 0).toBe(true);
    });

    it('converges across boundary over multiple readings', () => {
      smoother.update(350, null);

      // Turn from 350 to 10 (20° clockwise through north)
      for (let i = 0; i < 30; i++) {
        smoother.update(10, null);
      }

      const heading = smoother.heading!;
      // Should be close to 10, not stuck near 350
      expect(heading).toBeGreaterThan(5);
      expect(heading).toBeLessThan(15);
    });
  });

  describe('reset', () => {
    it('clears state back to initial', () => {
      smoother.update(90, null);
      expect(smoother.heading).toBe(90);

      smoother.reset();
      expect(smoother.heading).toBeNull();

      // Next reading is accepted directly
      expect(smoother.update(270, null)).toBe(270);
    });
  });
});

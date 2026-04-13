import { describe, it, expect, vi, beforeAll } from 'vitest';
import { correctElevations, getElevation } from './dem';

// Polyfill ImageData for Node/jsdom
if (typeof globalThis.ImageData === 'undefined') {
  (globalThis as Record<string, unknown>).ImageData = class ImageData {
    data: Uint8ClampedArray;
    width: number;
    height: number;
    constructor(data: Uint8ClampedArray, width: number, height: number) {
      this.data = data;
      this.width = width;
      this.height = height;
    }
  };
}

/** Encode an elevation into Terrain-RGB pixel values */
function encodeElevation(elev: number): [number, number, number] {
  const encoded = Math.round((elev + 10000) / 0.1);
  return [
    Math.floor(encoded / 65536),
    Math.floor((encoded % 65536) / 256),
    encoded % 256,
  ];
}

/**
 * Create a mock tile where elevation varies by pixel column.
 * Column 0 = baseElev, column 1 = baseElev + step, etc.
 * This lets us test that different DEM pixels produce different elevations
 * and that deduplication collapses same-pixel points.
 */
function createGradientTile(baseElev: number, step: number): ImageData {
  const data = new Uint8ClampedArray(256 * 256 * 4);
  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 256; x++) {
      const elev = baseElev + x * step;
      const [r, g, b] = encodeElevation(elev);
      const idx = (y * 256 + x) * 4;
      data[idx] = r;
      data[idx + 1] = g;
      data[idx + 2] = b;
      data[idx + 3] = 255;
    }
  }
  return new ImageData(data, 256, 256);
}

// Mock the browser APIs with a gradient tile
beforeAll(() => {
  // 500m base, +2m per pixel column
  const mockTile = createGradientTile(500, 2);

  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(new Blob()),
    }),
  );

  vi.stubGlobal(
    'createImageBitmap',
    vi.fn().mockResolvedValue({} as ImageBitmap),
  );

  vi.stubGlobal(
    'OffscreenCanvas',
    class {
      getContext() {
        return {
          drawImage: () => {},
          getImageData: () => mockTile,
        };
      }
    },
  );
});

describe('DEM elevation', () => {
  it('getElevation returns a number for a valid coordinate', async () => {
    const elev = await getElevation(35.05, -85.3);
    expect(typeof elev).toBe('number');
    expect(elev).toBeGreaterThanOrEqual(500);
  });

  it('correctElevations replaces altitude with DEM values', async () => {
    const points = [
      { lat: 35.05, lng: -85.3, altitude: 999 },
      { lat: 35.06, lng: -85.31, altitude: null },
    ];
    const corrected = await correctElevations(points);
    expect(corrected[0].altitude).toBeGreaterThanOrEqual(500);
    expect(corrected[1].altitude).toBeGreaterThanOrEqual(500);
    // Original unchanged
    expect(points[0].altitude).toBe(999);
  });

  it('correctElevations does not modify original array', async () => {
    const original = [{ lat: 35.05, lng: -85.3, altitude: 200 }];
    const corrected = await correctElevations(original);
    expect(original[0].altitude).toBe(200);
    expect(corrected[0].altitude).toBeGreaterThanOrEqual(500);
  });

  it('Terrain-RGB encoding/decoding round-trips correctly', () => {
    for (const elev of [0, 100, 500, 1000, 2000, -50]) {
      const [r, g, b] = encodeElevation(elev);
      const decoded = -10000 + (r * 65536 + g * 256 + b) * 0.1;
      expect(decoded).toBeCloseTo(elev, 0);
    }
  });
});

describe('DEM pixel deduplication', () => {
  it('collapses consecutive points on the same DEM pixel', async () => {
    // 10 points at nearly identical coordinates — all map to the same pixel
    const points = Array.from({ length: 10 }, (_, i) => ({
      lat: 35.05 + i * 0.0000001, // ~0.01m apart
      lng: -85.3,
      altitude: 200 + i,
    }));
    const corrected = await correctElevations(points);
    // Should collapse to 1 point since all land on the same DEM pixel
    expect(corrected.length).toBe(1);
  });

  it('keeps points that land on different DEM pixels', async () => {
    // Points spread far enough apart to hit different pixels
    // At z13, each pixel covers ~16m. 0.001° ≈ 111m = ~7 pixels apart.
    const points = [
      { lat: 35.05, lng: -85.3, altitude: 200 },
      { lat: 35.051, lng: -85.3, altitude: 200 },
      { lat: 35.052, lng: -85.3, altitude: 200 },
    ];
    const corrected = await correctElevations(points);
    expect(corrected.length).toBe(3);
  });

  it('deduplicates oscillating points between two pixels', async () => {
    // Simulate GPS wander: points alternate between two nearby positions
    // that map to different pixels, then come back — the classic staircase
    const a = { lat: 35.05, lng: -85.3 }; // pixel A
    const b = { lat: 35.0502, lng: -85.3 }; // pixel B (~22m away)
    const points = [
      { ...a, altitude: 200 },
      { ...a, altitude: 201 }, // same pixel as prev -> dedup
      { ...b, altitude: 202 }, // new pixel -> keep
      { ...b, altitude: 203 }, // same pixel as prev -> dedup
      { ...a, altitude: 204 }, // back to pixel A -> keep
      { ...a, altitude: 205 }, // same pixel -> dedup
      { ...b, altitude: 206 }, // back to pixel B -> keep
    ];
    const corrected = await correctElevations(points);
    // Should keep: A, B, A, B = 4 points (one per pixel transition)
    expect(corrected.length).toBe(4);
  });

  it('never deduplicates GPS-only points (outside tile area)', async () => {
    // Mock fetch to fail for specific coordinates
    const origFetch = globalThis.fetch;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));

    const points = [
      { lat: 0.0, lng: 0.0, altitude: 100 },
      { lat: 0.0, lng: 0.0, altitude: 101 },
      { lat: 0.0, lng: 0.0, altitude: 102 },
    ];
    const corrected = await correctElevations(points);
    // All points should be preserved — no dedup for GPS-only fallback
    expect(corrected.length).toBe(3);
    expect(corrected[0].altitude).toBe(100);
    expect(corrected[1].altitude).toBe(101);
    expect(corrected[2].altitude).toBe(102);

    // Restore fetch
    vi.stubGlobal('fetch', origFetch);
  });

  it('reduces point count significantly for stationary GPS wander', async () => {
    // 100 points at the same spot with minor jitter — simulates stopped at a light
    const points = Array.from({ length: 100 }, (_, i) => ({
      lat: 35.05 + Math.sin(i) * 0.00001, // ~1m jitter
      lng: -85.3 + Math.cos(i) * 0.00001,
      altitude: 500 + i * 0.1,
    }));
    const corrected = await correctElevations(points);
    // Most points should collapse — 100 points within ~2m should be very few unique pixels
    expect(corrected.length).toBeLessThan(10);
  });

  it('preserves all points when track moves steadily across pixels', async () => {
    // Points moving in a straight line, each hitting a new pixel
    // 0.0003° ≈ 33m per step, well beyond 16m pixel size
    const points = Array.from({ length: 20 }, (_, i) => ({
      lat: 35.05 + i * 0.0003,
      lng: -85.3,
      altitude: 200,
    }));
    const corrected = await correctElevations(points);
    // Most points should survive since each is on a different pixel
    expect(corrected.length).toBeGreaterThan(15);
  });
});

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
    const { corrected } = await correctElevations(points);
    expect(corrected[0].altitude).toBeGreaterThanOrEqual(500);
    expect(corrected[1].altitude).toBeGreaterThanOrEqual(500);
    // Original unchanged
    expect(points[0].altitude).toBe(999);
  });

  it('corrected array preserves all points', async () => {
    const points = Array.from({ length: 10 }, (_, i) => ({
      lat: 35.05 + i * 0.0000001, // same pixel
      lng: -85.3,
      altitude: 200 + i,
    }));
    const { corrected, deduplicated } = await correctElevations(points);
    // corrected keeps every point; deduplicated collapses them
    expect(corrected.length).toBe(10);
    expect(deduplicated.length).toBe(1);
  });

  it('correctElevations does not modify original array', async () => {
    const original = [{ lat: 35.05, lng: -85.3, altitude: 200 }];
    const { corrected } = await correctElevations(original);
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
    const points = Array.from({ length: 10 }, (_, i) => ({
      lat: 35.05 + i * 0.0000001,
      lng: -85.3,
      altitude: 200 + i,
    }));
    const { deduplicated } = await correctElevations(points);
    expect(deduplicated.length).toBe(1);
  });

  it('keeps points that land on different DEM pixels', async () => {
    const points = [
      { lat: 35.05, lng: -85.3, altitude: 200 },
      { lat: 35.051, lng: -85.3, altitude: 200 },
      { lat: 35.052, lng: -85.3, altitude: 200 },
    ];
    const { deduplicated } = await correctElevations(points);
    expect(deduplicated.length).toBe(3);
  });

  it('deduplicates oscillating points between two pixels', async () => {
    const a = { lat: 35.05, lng: -85.3 };
    const b = { lat: 35.0502, lng: -85.3 };
    const points = [
      { ...a, altitude: 200 },
      { ...a, altitude: 201 },
      { ...b, altitude: 202 },
      { ...b, altitude: 203 },
      { ...a, altitude: 204 },
      { ...a, altitude: 205 },
      { ...b, altitude: 206 },
    ];
    const { corrected, deduplicated } = await correctElevations(points);
    // corrected keeps all 7; deduplicated keeps A, B, A, B = 4
    expect(corrected.length).toBe(7);
    expect(deduplicated.length).toBe(4);
  });

  it('never deduplicates GPS-only points (outside tile area)', async () => {
    const origFetch = globalThis.fetch;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));

    const points = [
      { lat: 0.0, lng: 0.0, altitude: 100 },
      { lat: 0.0, lng: 0.0, altitude: 101 },
      { lat: 0.0, lng: 0.0, altitude: 102 },
    ];
    const { corrected, deduplicated } = await correctElevations(points);
    // Both arrays preserve all points — no dedup for GPS-only fallback
    expect(corrected.length).toBe(3);
    expect(deduplicated.length).toBe(3);
    expect(corrected[0].altitude).toBe(100);

    vi.stubGlobal('fetch', origFetch);
  });

  it('reduces point count significantly for stationary GPS wander', async () => {
    const points = Array.from({ length: 100 }, (_, i) => ({
      lat: 35.05 + Math.sin(i) * 0.00001,
      lng: -85.3 + Math.cos(i) * 0.00001,
      altitude: 500 + i * 0.1,
    }));
    const { corrected, deduplicated } = await correctElevations(points);
    expect(corrected.length).toBe(100); // all preserved
    expect(deduplicated.length).toBeLessThan(10); // most collapsed
  });

  it('preserves all points when track moves steadily across pixels', async () => {
    const points = Array.from({ length: 20 }, (_, i) => ({
      lat: 35.05 + i * 0.0003,
      lng: -85.3,
      altitude: 200,
    }));
    const { deduplicated } = await correctElevations(points);
    expect(deduplicated.length).toBeGreaterThan(15);
  });

  it('deduplication drops points that carry timestamp/distance data', async () => {
    const points = Array.from({ length: 50 }, (_, i) => ({
      lat: 35.05 + i * 0.0000001,
      lng: -85.3,
      altitude: 200 + i * 0.1,
      timestamp: 1000 + i * 1000,
    }));

    const { corrected, deduplicated } = await correctElevations(points);

    // corrected keeps all 50; deduplicated collapses to ~1
    expect(corrected.length).toBe(50);
    expect(deduplicated.length).toBeLessThan(5);

    // This confirms why buildRide must use corrected for storage
    // and deduplicated only for elevation stats
    expect(points[49].timestamp - points[0].timestamp).toBe(49000);
  });
});

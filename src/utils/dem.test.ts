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

// Mock fetch and OffscreenCanvas for Node environment
function createMockTile(elevation: number): ImageData {
  // Encode elevation as Terrain-RGB: height = -10000 + (R*65536 + G*256 + B) * 0.1
  const encoded = Math.round((elevation + 10000) / 0.1);
  const r = Math.floor(encoded / 65536);
  const g = Math.floor((encoded % 65536) / 256);
  const b = encoded % 256;

  const data = new Uint8ClampedArray(256 * 256 * 4);
  for (let i = 0; i < 256 * 256; i++) {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = 255;
  }
  return new ImageData(data, 256, 256);
}

// Mock the browser APIs
beforeAll(() => {
  const mockTile = createMockTile(500);

  // Mock fetch to return a blob
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(new Blob()),
    }),
  );

  // Mock createImageBitmap
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn().mockResolvedValue({} as ImageBitmap),
  );

  // Mock OffscreenCanvas
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
    expect(elev).toBeCloseTo(500, 0);
  });

  it('correctElevations replaces altitude with DEM values', async () => {
    const points = [
      { lat: 35.05, lng: -85.3, altitude: 999 },
      { lat: 35.06, lng: -85.31, altitude: null },
    ];
    const corrected = await correctElevations(points);
    // Both points should now have DEM elevation (~500m from mock)
    expect(corrected[0].altitude).toBeCloseTo(500, 0);
    expect(corrected[1].altitude).toBeCloseTo(500, 0);
    // Original unchanged
    expect(points[0].altitude).toBe(999);
  });

  it('correctElevations does not modify original array', async () => {
    const original = [{ lat: 35.05, lng: -85.3, altitude: 200 }];
    const corrected = await correctElevations(original);
    expect(original[0].altitude).toBe(200);
    expect(corrected[0].altitude).toBeCloseTo(500, 0);
  });

  it('Terrain-RGB encoding/decoding round-trips correctly', () => {
    // Test the encoding formula with known values
    for (const elev of [0, 100, 500, 1000, 2000, -50]) {
      const encoded = Math.round((elev + 10000) / 0.1);
      const r = Math.floor(encoded / 65536);
      const g = Math.floor((encoded % 65536) / 256);
      const b = encoded % 256;
      const decoded = -10000 + (r * 65536 + g * 256 + b) * 0.1;
      expect(decoded).toBeCloseTo(elev, 0);
    }
  });
});

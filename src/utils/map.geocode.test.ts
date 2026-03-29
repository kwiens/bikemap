import { describe, it, expect, vi, beforeEach } from 'vitest';
import { geocodeAddress } from './map';

describe('geocodeAddress', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should successfully geocode an address', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        features: [{ center: [-85.3097, 35.0456] }],
      }),
    });

    const result = await geocodeAddress(
      '100 Main St, Chattanooga, TN',
      'test-token',
    );

    expect(result).toEqual([-85.3097, 35.0456]);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining(
        'https://api.mapbox.com/geocoding/v5/mapbox.places/',
      ),
    );
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('access_token=test-token'),
    );
  });

  it('should return null when no results found', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ features: [] }),
    });

    const result = await geocodeAddress(
      'NonexistentAddress12345',
      'test-token',
    );
    expect(result).toBeNull();
  });

  it('should return null when request fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401 });

    const result = await geocodeAddress('100 Main St', 'invalid-token');
    expect(result).toBeNull();
  });

  it('should handle network errors gracefully', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    const result = await geocodeAddress('100 Main St', 'test-token');
    expect(result).toBeNull();
  });

  it('should properly encode special characters in address', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ features: [{ center: [-85.3, 35.0] }] }),
    });

    await geocodeAddress('123 Main St #5, Chattanooga, TN', 'test-token');

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining(
        encodeURIComponent('123 Main St #5, Chattanooga, TN'),
      ),
    );
  });

  it('should limit results to 1', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ features: [{ center: [-85.3, 35.0] }] }),
    });

    await geocodeAddress('Main St', 'test-token');

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('limit=1'),
    );
  });
});

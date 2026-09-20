import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ElevationProfile,
  gradeToColor,
  computeGrades,
  downsampleStops,
  formatGrade,
  MAX_GRADIENT_STOPS,
  findClosestProfileIndex,
  loadProfile,
  profilePointToXY,
} from './ElevationProfile';
import type { ElevationProfile as ElevationProfileData } from '@/data/geo_data';
import { MAP_EVENTS } from '@/events';

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class ResizeObserver {
      observe() {}
      disconnect() {}
    },
  );
});

describe('gradeToColor', () => {
  it('returns green for grade 0', () => {
    expect(gradeToColor(0)).toBe('rgb(34,197,94)');
  });

  it('returns a yellow-ish color for grade 12', () => {
    const color = gradeToColor(12);
    expect(color).toBe('rgb(234,179,8)');
  });

  it('returns a red-ish color for grade 25', () => {
    const color = gradeToColor(25);
    expect(color).toBe('rgb(239,0,68)');
  });

  it('uses absolute value so negative grades match positive', () => {
    expect(gradeToColor(-12)).toBe(gradeToColor(12));
  });

  it('clamps grades above 25 to the max color', () => {
    expect(gradeToColor(50)).toBe(gradeToColor(25));
  });
});

describe('computeGrades', () => {
  const climb: [number, number, number, number][] = [
    [0, 100, -85, 35],
    [100, 110, -85, 35],
    [200, 120, -85, 35],
    [300, 130, -85, 35],
    [400, 140, -85, 35],
    [500, 150, -85, 35],
  ];

  it('reads a steady grade correctly', () => {
    expect(computeGrades(climb)[3]).toBeCloseTo(10, 5);
  });

  it('signs a descent negative', () => {
    const drop: [number, number, number, number][] = climb.map(
      ([distance, elevation, lng, lat]) => [
        distance,
        200 - elevation,
        lng,
        lat,
      ],
    );

    expect(computeGrades(drop)[3]).toBeCloseTo(-10, 5);
  });

  it('weights uneven samples by their run distance', () => {
    const uneven: [number, number, number, number][] = [
      [0, 100, -85, 35],
      [6, 116, -85, 35],
      [11, 116, -85, 35],
      [90, 111, -85, 35],
      [112, 110, -85, 35],
      [131, 115, -85, 35],
    ];

    expect(computeGrades(uneven)[3]).toBeCloseTo(11.45, 2);
  });

  it('does not smooth across explicit geometry gaps', () => {
    const gapped: [number, number, number, number][] = [
      [0, 100, -85, 35],
      [100, 110, -85.1, 35],
      [600, 210, -86, 36],
      [700, 200, -86.1, 36],
      [800, 190, -86.2, 36],
    ];
    const gaps = [
      {
        feet: 500,
        from: [-85.1, 35] as [number, number],
        to: [-86, 36] as [number, number],
      },
    ];

    const grades = computeGrades(gapped, gaps);

    expect(grades[1]).toBeCloseTo(10, 5);
    expect(grades[2]).toBeCloseTo(-10, 5);
  });

  it('does not smooth across repeated-distance ride segment breaks', () => {
    const segmentedRide: [number, number, number, number][] = [
      [0, 100, -85, 35],
      [100, 110, -85.1, 35],
      [200, 120, -85.2, 35],
      [200, 200, -86, 36],
      [300, 190, -86.1, 36],
      [400, 180, -86.2, 36],
    ];

    const grades = computeGrades(segmentedRide);

    expect(grades[2]).toBeCloseTo(10, 5);
    expect(grades[3]).toBeCloseTo(-10, 5);
  });

  it('keeps a short pitch visible rather than averaging it away', () => {
    // A short climb should remain visible after distance-weighted smoothing.
    const pitch: [number, number, number, number][] = [
      [0, 100, -85, 35],
      [100, 100, -85, 35],
      [200, 130, -85, 35],
      [300, 130, -85, 35],
      [400, 130, -85, 35],
    ];
    expect(Math.max(...computeGrades(pitch))).toBeGreaterThan(9);
  });

  it('returns one grade per point and handles degenerate profiles', () => {
    expect(computeGrades(climb)).toHaveLength(climb.length);
    expect(computeGrades([[0, 100, -85, 35]])).toEqual([0]);
    expect(computeGrades([])).toEqual([]);
  });
});

describe('formatGrade', () => {
  it('signs climbs and descents', () => {
    expect(formatGrade(8.42)).toBe('+8.4%');
    expect(formatGrade(-8.42)).toBe('−8.4%');
  });

  it('does not add a sign to zero', () => {
    expect(formatGrade(0)).toBe('0.0%');
    expect(formatGrade(0.01)).toBe('0.0%');
  });

  it('degrades instead of displaying an invalid number', () => {
    expect(formatGrade(undefined)).toBe('—');
    expect(formatGrade(Number.NaN)).toBe('—');
  });
});

describe('downsampleStops', () => {
  function makePoints(n: number): [number, number, number, number][] {
    return Array.from({ length: n }, (_, i) => [
      i * 10,
      100 + i,
      -85 + i * 0.001,
      35 + i * 0.001,
    ]) as [number, number, number, number][];
  }

  it('returns all points when count is <= 200', () => {
    const points = makePoints(50);
    const colors = points.map(() => 'rgb(34,197,94)');
    const maxDist = points[points.length - 1][0];
    const stops = downsampleStops(points, colors, maxDist);
    expect(stops).toHaveLength(50);
  });

  it('caps the stop count on a profile longer than the cap', () => {
    const points = makePoints(MAX_GRADIENT_STOPS + 100);
    const colors = points.map(() => 'rgb(34,197,94)');
    const maxDist = points[points.length - 1][0];
    const stops = downsampleStops(points, colors, maxDist);
    expect(stops).toHaveLength(MAX_GRADIENT_STOPS);
  });

  it('first offset is 0 and last is approximately 1', () => {
    const points = makePoints(500);
    const colors = points.map(() => 'rgb(34,197,94)');
    const maxDist = points[points.length - 1][0];
    const stops = downsampleStops(points, colors, maxDist);
    expect(stops[0].offset).toBe(0);
    expect(stops[stops.length - 1].offset).toBeCloseTo(1, 2);
  });
});

describe('findClosestProfileIndex', () => {
  const points: [number, number, number, number][] = [
    [0, 100, -85.3, 35.0],
    [100, 110, -85.301, 35.001],
    [200, 120, -85.302, 35.002],
    [300, 130, -85.303, 35.003],
  ];

  it('returns null for empty array', () => {
    expect(findClosestProfileIndex([], -85.3, 35.0)).toBeNull();
  });

  it('returns index of closest point', () => {
    expect(findClosestProfileIndex(points, -85.302, 35.002)).toBe(2);
  });

  it('returns first point when location is at start', () => {
    expect(findClosestProfileIndex(points, -85.3, 35.0)).toBe(0);
  });

  it('returns null when location is too far from trail', () => {
    // ~1 degree away, well beyond 0.002 threshold
    expect(findClosestProfileIndex(points, -86.0, 36.0)).toBeNull();
  });

  it('returns closest even when between two points', () => {
    // Between point 1 and point 2
    const idx = findClosestProfileIndex(points, -85.3015, 35.0015);
    expect(idx).toBe(1);
  });
});

describe('profilePointToXY', () => {
  const points: [number, number, number, number][] = [
    [0, 100, -85.3, 35.0],
    [500, 150, -85.301, 35.001],
    [1000, 200, -85.302, 35.002],
  ];
  const profile: ElevationProfileData = {
    trail: 'Test',
    distance: 1000,
    gain: 100,
    loss: 0,
    min: 100,
    max: 200,
    profile: points,
  };

  it('returns x proportional to distance', () => {
    const { x } = profilePointToXY(points, 0, profile, 800);
    expect(x).toBe(0);

    const { x: xMid } = profilePointToXY(points, 1, profile, 800);
    expect(xMid).toBe(400);

    const { x: xEnd } = profilePointToXY(points, 2, profile, 800);
    expect(xEnd).toBe(800);
  });

  it('returns y inverted (higher elevation = lower y)', () => {
    const { y: yLow } = profilePointToXY(points, 0, profile, 800);
    const { y: yHigh } = profilePointToXY(points, 2, profile, 800);
    expect(yHigh).toBeLessThan(yLow);
  });

  it('handles min === max (yRange defaults to 1)', () => {
    const flatProfile: ElevationProfileData = {
      ...profile,
      min: 100,
      max: 100,
    };
    const { y } = profilePointToXY(points, 0, flatProfile, 800);
    expect(Number.isFinite(y)).toBe(true);
  });
});

describe('loadProfile', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const stored: ElevationProfileData = {
    trail: 'Stored',
    distance: 10,
    gain: 1,
    loss: 1,
    min: 0,
    max: 1,
    profile: [[0, 0, -85.3, 35]],
  };
  const onDisk: ElevationProfileData = { ...stored, trail: 'On disk' };

  function stubFetch(
    responses: Record<string, { ok: boolean; body?: ElevationProfileData }>,
  ) {
    const fetchMock = vi.fn(async (url: string) => {
      const match = Object.entries(responses).find(([prefix]) =>
        url.startsWith(prefix),
      );
      if (!match) throw new Error(`Unexpected fetch: ${url}`);
      return {
        ok: match[1].ok,
        status: match[1].ok ? 200 : 404,
        json: async () => match[1].body,
      };
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it('prefers the stored profile and scopes it to the city', async () => {
    const fetchMock = stubFetch({
      '/api/map/elevation/': { ok: true, body: stored },
      '/data/elevation/': { ok: true, body: onDisk },
    });

    const result = await loadProfile(
      'ridge-trail',
      'bend',
      new AbortController().signal,
    );

    expect(result).toEqual(stored);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(
      '/api/map/elevation/ridge-trail?city=bend',
    );
  });

  it.each(['bend', 'chattanooga'] as const)(
    'falls back to the %s file when nothing is stored',
    async (city) => {
      // Chattanooga's trails are seeded without geometry, so they have no stored
      // profile and only the offline file can draw their chart.
      const fetchMock = stubFetch({
        '/api/map/elevation/': { ok: false },
        [`/data/elevation/${city}/`]: { ok: true, body: onDisk },
      });

      const result = await loadProfile(
        'ridge-trail',
        city,
        new AbortController().signal,
      );

      expect(result).toEqual(onDisk);
      expect(fetchMock.mock.calls[1][0]).toBe(
        `/data/elevation/${city}/ridge-trail.json`,
      );
    },
  );

  it('does not fall back when the selection changed', async () => {
    const abortError = new Error('The operation was aborted.');
    abortError.name = 'AbortError';
    const fetchMock = vi.fn(async () => {
      throw abortError;
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      loadProfile('ridge-trail', 'bend', new AbortController().signal),
    ).rejects.toThrow(/aborted/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('ElevationProfile selection source', () => {
  it('uses readable grade text with a separate color swatch', () => {
    const profile: ElevationProfileData = {
      trail: 'Test Trail',
      distance: 400,
      gain: 40,
      loss: 0,
      min: 100,
      max: 140,
      profile: [
        [0, 100, -85.3, 35],
        [100, 110, -85.301, 35.001],
        [200, 120, -85.302, 35.002],
        [300, 130, -85.303, 35.003],
        [400, 140, -85.304, 35.004],
      ],
    };

    render(<ElevationProfile />);
    act(() => {
      window.dispatchEvent(
        new CustomEvent(MAP_EVENTS.OSM_TRAIL_SELECT, {
          detail: { profile },
        }),
      );
    });

    const chart = screen.getByRole('img', {
      name: 'Elevation profile for Test Trail',
    });
    vi.spyOn(chart, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      width: 400,
    } as DOMRect);
    fireEvent.mouseMove(chart, { clientX: 200 });

    const grade = screen.getByText('+10.0%');
    expect(grade).toHaveClass('text-gray-700');
    expect(grade.querySelector('[aria-hidden="true"]')).toHaveStyle({
      backgroundColor: gradeToColor(computeGrades(profile.profile)[2]),
    });
  });

  it('loads a curated profile when an OSM trail with the same name was selected', async () => {
    const osmProfile: ElevationProfileData = {
      trail: 'Big Forest',
      distance: 5280,
      gain: 999,
      loss: 10,
      min: 100,
      max: 200,
      profile: [
        [0, 100, -85.3, 35],
        [100, 110, -85.301, 35.001],
        [200, 120, -85.302, 35.002],
        [300, 130, -85.303, 35.003],
        [400, 140, -85.304, 35.004],
      ],
    };
    const curatedProfile: ElevationProfileData = {
      ...osmProfile,
      gain: 123,
    };
    vi.mocked(fetch)
      .mockResolvedValueOnce({ ok: false, status: 404 } as Response)
      .mockResolvedValue({
        ok: true,
        json: async () => curatedProfile,
      } as Response);

    render(<ElevationProfile />);
    act(() => {
      window.dispatchEvent(
        new CustomEvent(MAP_EVENTS.OSM_TRAIL_SELECT, {
          detail: { profile: osmProfile },
        }),
      );
    });
    expect(screen.getByText('+999 ft climbing')).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(
        new CustomEvent(MAP_EVENTS.TRAIL_SELECT, {
          detail: { trailName: 'Big Forest' },
        }),
      );
    });

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        '/data/elevation/chattanooga/big-forest.json',
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
      expect(screen.getByText('+123 ft climbing')).toBeInTheDocument();
    });
  });
});

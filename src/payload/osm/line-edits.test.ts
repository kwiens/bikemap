import { describe, expect, it } from 'vitest';
import {
  deletePoints,
  joinParts,
  movePoints,
  reverseParts,
  simplifyParts,
  splitAtPoints,
} from './line-edits';

const STEP = 0.0001;
const at = (x: number, y = 0): [number, number] => [
  -121.3 + x * STEP,
  44 + y * STEP,
];
const line = (...xs: number[]) => xs.map((x) => at(x));

describe('deletePoints', () => {
  it('removes points across pieces and drops a piece left too short', () => {
    const result = deletePoints(
      [line(0, 1, 2, 3), line(10, 11)],
      [
        { index: 1, part: 0 },
        { index: 0, part: 1 },
      ],
    );
    expect(result.parts).toEqual([line(0, 2, 3)]);
    expect(result.selection).toEqual([]);
  });

  it('does not touch its input', () => {
    const parts = [line(0, 1, 2)];
    deletePoints(parts, [{ index: 1, part: 0 }]);
    expect(parts).toEqual([line(0, 1, 2)]);
  });
});

describe('movePoints', () => {
  it('moves only the selected points, by the same offset', () => {
    const result = movePoints(
      [line(0, 1, 2)],
      [{ index: 1, part: 0 }],
      [STEP, STEP],
    );
    expect(result.parts[0][0]).toEqual(at(0));
    expect(result.parts[0][1][0]).toBeCloseTo(at(2, 1)[0], 12);
    expect(result.parts[0][1][1]).toBeCloseTo(at(2, 1)[1], 12);
  });
});

describe('splitAtPoints', () => {
  it('splits at interior points, keeping the split point on both sides', () => {
    const result = splitAtPoints(
      [line(0, 1, 2, 3, 4)],
      [
        { index: 1, part: 0 },
        { index: 3, part: 0 },
      ],
    );
    expect(result.parts).toEqual([line(0, 1), line(1, 2, 3), line(3, 4)]);
    expect(result.selection).toEqual([
      { index: 1, part: 0 },
      { index: 0, part: 1 },
      { index: 2, part: 1 },
      { index: 0, part: 2 },
    ]);
  });

  it('ignores endpoints, which split nothing', () => {
    const result = splitAtPoints([line(0, 1, 2)], [{ index: 0, part: 0 }]);
    expect(result.parts).toEqual([line(0, 1, 2)]);
  });
});

describe('reverseParts', () => {
  it('reverses targets and remaps their selected points', () => {
    const result = reverseParts(
      [line(0, 1, 2), line(5, 6)],
      [0],
      [{ index: 0, part: 0 }],
    );
    expect(result.parts).toEqual([line(2, 1, 0), line(5, 6)]);
    expect(result.selection).toEqual([{ index: 2, part: 0 }]);
  });
});

describe('joinParts', () => {
  it('merges touching ends and orients pieces to meet', () => {
    // Second piece runs backwards; its last point touches the first's end.
    const result = joinParts([line(0, 1, 2), line(4, 3, 2)], [0, 1]);
    expect(result.parts).toEqual([line(0, 1, 2, 3, 4)]);
  });

  it('bridges a gap with a straight segment', () => {
    const result = joinParts([line(0, 1), line(5, 6)], [0, 1]);
    expect(result.parts).toEqual([line(0, 1, 5, 6)]);
  });

  it('prepends a piece that meets the start', () => {
    const result = joinParts([line(5, 6), line(0, 1, 5)], [0, 1]);
    expect(result.parts).toEqual([line(0, 1, 5, 6)]);
  });

  it('leaves pieces it was not asked to join', () => {
    const result = joinParts([line(0, 1), line(20, 21), line(1, 2)], [0, 2]);
    expect(result.parts).toEqual([line(0, 1, 2), line(20, 21)]);
  });
});

describe('simplifyParts', () => {
  // A straight run with tiny jitter: everything but the ends goes at 3 m.
  const jittery = [at(0), at(1, 0.01), at(2, -0.01), at(3, 0.01), at(4)];

  it('simplifies whole pieces when nothing is selected', () => {
    expect(simplifyParts([jittery], 3).parts[0]).toHaveLength(2);
  });

  it('simplifies only the selected run and keeps everything else', () => {
    const result = simplifyParts([jittery], 3, [
      { index: 0, part: 0 },
      { index: 1, part: 0 },
      { index: 2, part: 0 },
    ]);
    expect(result.parts[0]).toEqual([at(0), at(2, -0.01), at(3, 0.01), at(4)]);
  });
});

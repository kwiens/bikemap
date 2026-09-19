import { describe, expect, it } from 'vitest';
import { createDeletedPieces } from './deleted-pieces';

// The safety net under the Delete key. Terra Draw removes a whole piece of a
// trail with one keystroke and cannot undo it; this is what makes it
// recoverable, so the cases below are the difference between "dropped a stray
// section" and "lost part of a trail with no way back".

const A: [number, number] = [-121.53, 43.97];
const B: [number, number] = [-121.528, 43.971];
const C: [number, number] = [-121.49, 43.95];
const D: [number, number] = [-121.488, 43.951];

const twoPieces: [number, number][][] = [
  [A, B],
  [C, D],
];
const onePiece: [number, number][][] = [[A, B]];

describe('createDeletedPieces', () => {
  it('records a snapshot when a piece disappears', () => {
    const deleted = createDeletedPieces();
    expect(deleted.record(twoPieces, onePiece)).toBe(true);
    expect(deleted.depth()).toBe(1);
    expect(deleted.restore()).toEqual(twoPieces);
  });

  it('ignores a change that only moves points', () => {
    // Terra Draw undoes these itself. Snapshotting them would mean copying the
    // whole line on every frame of a drag.
    const deleted = createDeletedPieces();
    const moved: [number, number][][] = [
      [A, [-121.527, 43.9715]],
      [C, D],
    ];
    expect(deleted.record(twoPieces, moved)).toBe(false);
    expect(deleted.depth()).toBe(0);
  });

  it('ignores a change that adds a piece', () => {
    const deleted = createDeletedPieces();
    expect(deleted.record(onePiece, twoPieces)).toBe(false);
    expect(deleted.depth()).toBe(0);
  });

  it('catches a piece whittled away below two points', () => {
    // Deleting points one at a time can also make a piece cease to exist —
    // `parseTrailGeometry` drops a run of one. Same loss, same recovery.
    const deleted = createDeletedPieces();
    expect(deleted.record(twoPieces, onePiece)).toBe(true);
    expect(deleted.restore()).toEqual(twoPieces);
  });

  it('restores in reverse order, and reports nothing left', () => {
    const deleted = createDeletedPieces();
    const three: [number, number][][] = [...twoPieces, [B, C]];
    deleted.record(three, twoPieces);
    deleted.record(twoPieces, onePiece);

    expect(deleted.depth()).toBe(2);
    expect(deleted.restore()).toEqual(twoPieces);
    expect(deleted.restore()).toEqual(three);
    expect(deleted.restore()).toBeNull();
    expect(deleted.depth()).toBe(0);
  });

  it('snapshots a copy, not the live line', () => {
    // The editor hands in its working array, which Terra Draw goes on mutating.
    // Aliasing it would restore whatever the line later became.
    // Built from fresh arrays rather than the shared fixtures, so mutating it
    // below cannot reach back and rewrite what we assert against.
    const live: [number, number][][] = [
      [
        [-121.53, 43.97],
        [-121.528, 43.971],
      ],
      [[...C], [...D]],
    ];
    const deleted = createDeletedPieces();
    deleted.record(live, onePiece);
    live[0][0][0] = 0;

    expect(deleted.restore()?.[0][0]).toEqual([-121.53, 43.97]);
  });

  it('forgets everything when a new line is loaded', () => {
    // Undoing past a save would be undoing someone else's work.
    const deleted = createDeletedPieces();
    deleted.record(twoPieces, onePiece);
    deleted.clear();

    expect(deleted.depth()).toBe(0);
    expect(deleted.restore()).toBeNull();
  });
});

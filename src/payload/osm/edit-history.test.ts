import { describe, expect, it } from 'vitest';
import { createEditHistory } from './edit-history';

const A: [number, number][][] = [
  [
    [0, 0],
    [1, 1],
  ],
];
const B: [number, number][][] = [
  [
    [0, 0],
    [2, 2],
  ],
];
const C: [number, number][][] = [
  [
    [0, 0],
    [3, 3],
  ],
];

describe('createEditHistory', () => {
  it('undoes and redoes in order', () => {
    const history = createEditHistory();
    history.push(A); // A -> B
    history.push(B); // B -> C
    expect(history.undo(C)).toEqual(B);
    expect(history.undo(B)).toEqual(A);
    expect(history.canUndo()).toBe(false);
    expect(history.redo(A)).toEqual(B);
    expect(history.redo(B)).toEqual(C);
    expect(history.canRedo()).toBe(false);
  });

  it('drops the redo stack on a new edit', () => {
    const history = createEditHistory();
    history.push(A);
    history.undo(B);
    history.push(A);
    expect(history.canRedo()).toBe(false);
  });

  it('keeps its own copies, so later mutation cannot rewrite history', () => {
    const history = createEditHistory();
    const before: [number, number][][] = [
      [
        [0, 0],
        [1, 1],
      ],
    ];
    history.push(before);
    before[0][1][0] = 99;
    expect(history.undo(B)).toEqual(A);
  });

  it('forgets the oldest entries past its limit', () => {
    const history = createEditHistory(2);
    history.push(A);
    history.push(B);
    history.push(C);
    expect(history.undo(C)).toEqual(C);
    expect(history.undo(C)).toEqual(B);
    expect(history.canUndo()).toBe(false);
  });
});

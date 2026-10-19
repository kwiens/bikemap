/**
 * Undo and redo for the geometry editor, as whole-line snapshots.
 *
 * Terra Draw's own session history covers the edits Terra Draw makes — a point
 * dragged, inserted, or deleted — and nothing else. It could never undo a
 * deleted piece (it reports success and leaves the piece gone), and it knows
 * nothing about the editor's bulk operations: route-following, multi-point
 * moves, split, join, simplify. Those replace the store wholesale, and every
 * entry it held would then point at features that no longer exist.
 *
 * So the editor keeps one history of its own, for everything. An entry is the
 * line as it was before an edit settled — the end of a drag, a finished piece,
 * one bulk operation — so a drag is one step however many frames it took.
 * Terra Draw keeps only its mode-level history, for taking back points of a
 * piece that is still being drawn.
 *
 * Snapshots are cheap at trail scale: a few thousand coordinate pairs, capped
 * at {@link MAX_HISTORY} entries.
 *
 * Client-safe, like `geometry.ts` — this runs in the admin bundle.
 */
import { cloneParts } from './geometry';

type Parts = [number, number][][];

export const MAX_HISTORY = 100;

export interface EditHistory {
  canRedo(): boolean;
  canUndo(): boolean;
  /** Forgets everything. A newly loaded line has nothing behind it to restore. */
  clear(): void;
  /** Records the line as it was before an edit. Clears the redo stack. */
  push(before: Parts): void;
  /** The line to restore after redoing, given the line now on screen. */
  redo(current: Parts): Parts | null;
  /** The line to restore, given the line now on screen (which becomes redoable). */
  undo(current: Parts): Parts | null;
}

export function createEditHistory(limit = MAX_HISTORY): EditHistory {
  const past: Parts[] = [];
  const future: Parts[] = [];

  return {
    canRedo: () => future.length > 0,
    canUndo: () => past.length > 0,
    clear() {
      past.length = 0;
      future.length = 0;
    },
    push(before) {
      past.push(cloneParts(before));
      if (past.length > limit) {
        past.shift();
      }
      future.length = 0;
    },
    redo(current) {
      const next = future.pop();
      if (!next) {
        return null;
      }
      past.push(cloneParts(current));
      return cloneParts(next);
    },
    undo(current) {
      const previous = past.pop();
      if (!previous) {
        return null;
      }
      future.push(cloneParts(current));
      return cloneParts(previous);
    },
  };
}

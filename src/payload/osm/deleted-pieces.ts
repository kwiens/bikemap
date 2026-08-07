/**
 * An undo stack for the one edit Terra Draw cannot take back.
 *
 * Terra Draw's history records coordinate edits — moving a point, inserting
 * one, deleting one — and undoes them faithfully. Deleting a whole *feature* is
 * outside it. After the Delete key removes a piece of a trail, `canUndo()` still
 * answers true and `undo()` still reports success, and the piece stays gone.
 *
 * That made Delete the single keystroke in the geometry editor you could not
 * take back: a trail lost a section, the Undo button lit up and did nothing, and
 * reloading the page — losing every other edit with it — was the only way out.
 * Worse, the editor's own hint used to recommend the keystroke, describing it as
 * the way to remove a *point*.
 *
 * So the deletions Terra Draw can't reverse are the ones recorded here. Narrow
 * on purpose: everything else undoes through Terra Draw, and snapshotting every
 * change would mean copying the whole line on every frame of a drag.
 *
 * Client-safe, like `geometry.ts` — this runs in the admin bundle.
 */
import { cloneParts } from './geometry';

/** Coordinate runs, the same shape `parseTrailGeometry` yields. */
type Parts = [number, number][][];

export interface DeletedPieces {
  /** Forgets everything. A newly loaded line has nothing behind it to restore. */
  clear(): void;
  /** How many restores are available — what the Undo button asks. */
  depth(): number;
  /**
   * Records a change, keeping a snapshot only if a piece disappeared.
   *
   * Returns whether it kept one, so the caller can refresh the toolbar without
   * having to re-derive why.
   */
  record(previous: Parts, next: Parts): boolean;
  /** The line as it was before the most recent piece went missing. */
  restore(): Parts | null;
}

export function createDeletedPieces(): DeletedPieces {
  const stack: Parts[] = [];

  return {
    clear() {
      stack.length = 0;
    },
    depth() {
      return stack.length;
    },
    record(previous, next) {
      // Fewer pieces than before is the whole signal. A piece can also vanish
      // by having its points deleted down past two, which `parseTrailGeometry`
      // drops — that counts too, and is caught by the same comparison.
      if (next.length >= previous.length) {
        return false;
      }
      stack.push(cloneParts(previous));
      return true;
    },
    restore() {
      return stack.pop() ?? null;
    },
  };
}

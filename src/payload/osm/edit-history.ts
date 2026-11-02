/**
 * Bounded snapshot history for editor documents. Mutable geometry supplies a
 * deep copy; immutable route plans can retain their references so pending-leg
 * identity checks still work. Unfinished drawing gestures keep their own history.
 */
const MAX_HISTORY = 100;

export interface EditHistory<T> {
  canRedo(): boolean;
  canUndo(): boolean;
  /** Forgets everything. A newly loaded document starts with no history. */
  clear(): void;
  /** Records the document before an edit. Clears the redo stack. */
  push(before: T): void;
  /** The document to restore after redoing, given the current document. */
  redo(current: T): T | null;
  /** The document to restore, making the current document redoable. */
  undo(current: T): T | null;
}

export function createEditHistory<T>(
  copy: (value: T) => T,
  limit = MAX_HISTORY,
): EditHistory<T> {
  const past: T[] = [];
  const future: T[] = [];

  return {
    canRedo: () => future.length > 0,
    canUndo: () => past.length > 0,
    clear() {
      past.length = 0;
      future.length = 0;
    },
    push(before) {
      past.push(copy(before));
      if (past.length > limit) {
        past.shift();
      }
      future.length = 0;
    },
    redo(current) {
      const next = future.pop();
      if (next === undefined) {
        return null;
      }
      past.push(copy(current));
      return copy(next);
    },
    undo(current) {
      const previous = past.pop();
      if (previous === undefined) {
        return null;
      }
      future.push(copy(current));
      return copy(previous);
    },
  };
}

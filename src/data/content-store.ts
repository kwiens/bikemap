/**
 * A module-level store for one kind of published content (routes, trails, …).
 *
 * The server reads content from Payload and hands it to the client as props;
 * the client publishes it into one of these during render, before anything
 * that draws it mounts. Consumers call `get()` at the moment they need the
 * list — never bind the result to a module `const`, which would capture
 * whatever was there at import time — and anything derived from it is
 * rebuilt through `subscribe`.
 */

export interface ContentStore<T> {
  get(): T[];
  /**
   * Replace the list. The same reference is a no-op. An empty list is a
   * no-op too when the store has a checked-in fallback: an empty or
   * unreachable database must leave the fallback in place rather than blank
   * the map. A store without a fallback accepts an empty list, because for
   * it the database is the only truth.
   */
  set(next: T[]): void;
  /** True once `set` has accepted a list from the server. */
  isFromDatabase(): boolean;
  /** Called after every accepted `set`, so derived lookups can be rebuilt. */
  subscribe(notify: () => void): () => void;
}

export function createContentStore<T>(fallback?: T[]): ContentStore<T> {
  let items: T[] = fallback ?? [];
  let fromDatabase = false;
  const subscribers = new Set<() => void>();

  return {
    get: () => items,
    set(next) {
      if (next === items) return;
      if (next.length === 0 && fallback !== undefined) return;
      items = next;
      fromDatabase = true;
      for (const notify of subscribers) notify();
    },
    isFromDatabase: () => fromDatabase,
    subscribe(notify) {
      subscribers.add(notify);
      return () => subscribers.delete(notify);
    },
  };
}

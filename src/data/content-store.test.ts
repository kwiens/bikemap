import { describe, it, expect, vi } from 'vitest';
import { createContentStore } from './content-store';

describe('createContentStore', () => {
  it('starts from the fallback and reports it is not from the database', () => {
    const store = createContentStore(['a']);
    expect(store.get()).toEqual(['a']);
    expect(store.isFromDatabase()).toBe(false);
  });

  it('starts empty without a fallback', () => {
    expect(createContentStore<string>().get()).toEqual([]);
  });

  it('accepts a list, marks it as from the database and notifies', () => {
    const store = createContentStore(['fallback']);
    const notify = vi.fn();
    store.subscribe(notify);
    store.set(['db']);
    expect(store.get()).toEqual(['db']);
    expect(store.isFromDatabase()).toBe(true);
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('keeps the fallback when the database hands back nothing', () => {
    const store = createContentStore(['fallback']);
    const notify = vi.fn();
    store.subscribe(notify);
    store.set([]);
    expect(store.get()).toEqual(['fallback']);
    expect(store.isFromDatabase()).toBe(false);
    expect(notify).not.toHaveBeenCalled();
  });

  it('accepts an empty list when there is no fallback', () => {
    const store = createContentStore<string>();
    store.set(['one']);
    store.set([]);
    expect(store.get()).toEqual([]);
  });

  it('treats the same reference as a no-op and honours unsubscribe', () => {
    const store = createContentStore<string>();
    const notify = vi.fn();
    const unsubscribe = store.subscribe(notify);
    const list = ['x'];
    store.set(list);
    store.set(list);
    expect(notify).toHaveBeenCalledTimes(1);
    unsubscribe();
    store.set(['y']);
    expect(notify).toHaveBeenCalledTimes(1);
  });
});

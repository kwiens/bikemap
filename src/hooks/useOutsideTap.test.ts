/** @vitest-environment jsdom */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, fireEvent, cleanup } from '@testing-library/react';
import { useOutsideTap } from './useOutsideTap';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('useOutsideTap', () => {
  it('uses the latest enabled predicate, callback and inside elements without reattaching', () => {
    vi.stubGlobal('innerWidth', 767);
    const addSpy = vi.spyOn(document, 'addEventListener');
    const first = vi.fn();
    const second = vi.fn();
    const oldInside = document.createElement('div');
    const newInside = document.createElement('div');
    document.body.append(oldInside, newInside);

    try {
      const { rerender } = renderHook(
        ({ isEnabled, onTap, inside }) =>
          useOutsideTap([{ current: inside }], () => isEnabled, onTap),
        { initialProps: { isEnabled: false, onTap: first, inside: oldInside } },
      );
      fireEvent.pointerDown(document.body);
      expect(first).not.toHaveBeenCalled();

      const subscriptions = addSpy.mock.calls.filter(
        ([name]) => name === 'pointerdown',
      ).length;
      rerender({ isEnabled: true, onTap: second, inside: newInside });
      fireEvent.pointerDown(newInside);
      expect(second).not.toHaveBeenCalled();
      fireEvent.pointerDown(oldInside);
      expect(second).toHaveBeenCalledTimes(1);
      expect(first).not.toHaveBeenCalled();

      rerender({ isEnabled: false, onTap: second, inside: newInside });
      fireEvent.pointerDown(document.body);
      expect(second).toHaveBeenCalledTimes(1);
      expect(
        addSpy.mock.calls.filter(([name]) => name === 'pointerdown'),
      ).toHaveLength(subscriptions);
    } finally {
      oldInside.remove();
      newInside.remove();
    }
  });

  it('checks the current viewport and removes its listener on unmount', () => {
    vi.stubGlobal('innerWidth', 768);
    const onTap = vi.fn();
    const { unmount } = renderHook(() => useOutsideTap([], () => true, onTap));

    fireEvent.pointerDown(document.body);
    expect(onTap).not.toHaveBeenCalled();
    vi.stubGlobal('innerWidth', 767);
    fireEvent.pointerDown(document.body);
    expect(onTap).toHaveBeenCalledTimes(1);
    unmount();
    fireEvent.pointerDown(document.body);
    expect(onTap).toHaveBeenCalledTimes(1);
  });
});

/** @vitest-environment jsdom */

import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { MAP_EVENTS, dispatchMapEvent } from '@/events';
import { useMapEvent } from './useMapEvent';

describe('useMapEvent', () => {
  it('subscribes for the component lifetime and unsubscribes on unmount', () => {
    const handler = vi.fn();
    const { unmount } = renderHook(() =>
      useMapEvent(MAP_EVENTS.SIDEBAR_TOGGLE, handler),
    );

    dispatchMapEvent(MAP_EVENTS.SIDEBAR_TOGGLE, { isOpen: true });
    expect(handler).toHaveBeenCalledWith({ isOpen: true });

    unmount();
    dispatchMapEvent(MAP_EVENTS.SIDEBAR_TOGGLE, { isOpen: false });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('always calls the latest handler without re-subscribing', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(
      ({ handler }: { handler: () => void }) =>
        useMapEvent(MAP_EVENTS.RIDE_DESELECT, handler),
      { initialProps: { handler: first } },
    );
    const subscriptions = addSpy.mock.calls.filter(
      ([type]) => type === MAP_EVENTS.RIDE_DESELECT,
    ).length;

    rerender({ handler: second });
    dispatchMapEvent(MAP_EVENTS.RIDE_DESELECT);

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    expect(
      addSpy.mock.calls.filter(([type]) => type === MAP_EVENTS.RIDE_DESELECT),
    ).toHaveLength(subscriptions);
    addSpy.mockRestore();
  });
});

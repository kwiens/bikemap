import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useToast } from './useToast';

describe('useToast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should initialize with no message', () => {
    const { result } = renderHook(() => useToast());

    expect(result.current.message).toBeNull();
    expect(result.current.isFadingOut).toBe(false);
  });

  it('should show a toast message when showToast is called', () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      result.current.showToast('Hello World');
    });

    expect(result.current.message).toBe('Hello World');
    expect(result.current.isFadingOut).toBe(false);
  });

  it('should start fading out before auto-dismiss', () => {
    const { result } = renderHook(() => useToast(3000));

    act(() => {
      result.current.showToast('Test Message');
    });

    expect(result.current.isFadingOut).toBe(false);

    // Advance time to just before fade-out starts (2700ms for 3000ms duration)
    act(() => {
      vi.advanceTimersByTime(2699);
    });

    expect(result.current.isFadingOut).toBe(false);

    // Advance past fade-out start
    act(() => {
      vi.advanceTimersByTime(2);
    });

    expect(result.current.isFadingOut).toBe(true);
    expect(result.current.message).toBe('Test Message');
  });

  it('should auto-dismiss toast after duration', () => {
    const { result } = renderHook(() => useToast(3000));

    act(() => {
      result.current.showToast('Auto Dismiss');
    });

    expect(result.current.message).toBe('Auto Dismiss');

    // Advance past full duration
    act(() => {
      vi.advanceTimersByTime(3001);
    });

    expect(result.current.message).toBeNull();
    expect(result.current.isFadingOut).toBe(false);
  });

  it('should reset fade-out state when showing new toast', () => {
    const { result } = renderHook(() => useToast(3000));

    act(() => {
      result.current.showToast('First Message');
    });

    // Advance to fade-out state
    act(() => {
      vi.advanceTimersByTime(2700);
    });

    expect(result.current.isFadingOut).toBe(true);

    // Show new toast
    act(() => {
      result.current.showToast('Second Message');
    });

    expect(result.current.message).toBe('Second Message');
    expect(result.current.isFadingOut).toBe(false);
  });

  it('should use custom duration', () => {
    const { result } = renderHook(() => useToast(1000));

    act(() => {
      result.current.showToast('Quick Toast');
    });

    // Should not be dismissed yet at 500ms
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(result.current.message).toBe('Quick Toast');

    // Should be dismissed after 1000ms
    act(() => {
      vi.advanceTimersByTime(501);
    });

    expect(result.current.message).toBeNull();
  });
});

/** @vitest-environment jsdom */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { RidesPanel } from './RidesPanel';
import { MAP_EVENTS } from '@/events';
import { initLayout, setSidebarOpen } from '@/hooks/useLayout';

// Mock useRideRecording hook — rebuilt each test via beforeEach
function createMockHook() {
  return {
    isRecording: false,
    isPaused: false,
    hasRecovery: false,
    elapsedTime: 0,
    liveDistance: 0,
    liveElevationGain: 0,
    startRecording: vi.fn(),
    pauseRecording: vi.fn(),
    resumeRecording: vi.fn(),
    stopRecording: vi.fn().mockResolvedValue(null),
    recoverRide: vi.fn().mockResolvedValue(null),
    dismissRecovery: vi.fn(),
  };
}

let mockHook = createMockHook();

vi.mock('@/hooks', () => ({
  useRideRecording: () => mockHook,
}));

vi.mock('./sidebar/RideHistory', () => ({
  RideHistory: () => <div data-testid="ride-history" />,
}));

vi.mock('./styles', () => ({
  TOGGLE_BTN_CLASS: 'toggle-btn',
  TOGGLE_ICON_CLASS: 'toggle-icon',
}));

function openPanel() {
  fireEvent.click(screen.getByLabelText('Open rides panel'));
}

describe('RidesPanel', () => {
  beforeEach(() => {
    mockHook = createMockHook();
    initLayout({ sidebarOpen: true });
  });

  it('renders toggle button', () => {
    render(<RidesPanel />);
    expect(screen.getByLabelText('Open rides panel')).toBeInTheDocument();
  });

  it('opens panel on toggle click', () => {
    render(<RidesPanel />);
    openPanel();
    expect(screen.getByText('My Rides')).toBeInTheDocument();
  });

  it('shows Record a Ride button when not recording', () => {
    render(<RidesPanel />);
    openPanel();
    expect(screen.getByText('Record a Ride')).toBeInTheDocument();
  });

  it('calls startRecording when Record button clicked', () => {
    render(<RidesPanel />);
    openPanel();
    fireEvent.click(screen.getByText('Record a Ride'));
    expect(mockHook.startRecording).toHaveBeenCalled();
  });

  it('shows recording controls when recording', () => {
    mockHook.isRecording = true;
    render(<RidesPanel />);
    openPanel();
    expect(screen.getByText('Finish')).toBeInTheDocument();
    expect(screen.getByText('Pause')).toBeInTheDocument();
  });

  it('calls pauseRecording when Pause clicked', () => {
    mockHook.isRecording = true;
    render(<RidesPanel />);
    openPanel();
    fireEvent.click(screen.getByText('Pause'));
    expect(mockHook.pauseRecording).toHaveBeenCalled();
  });

  it('shows Resume when paused', () => {
    mockHook.isRecording = true;
    mockHook.isPaused = true;
    render(<RidesPanel />);
    openPanel();
    expect(screen.getByText('Resume')).toBeInTheDocument();
  });

  it('calls stopRecording when Finish clicked', async () => {
    mockHook.isRecording = true;
    render(<RidesPanel />);
    openPanel();

    await act(async () => {
      fireEvent.click(screen.getByText('Finish'));
    });

    expect(mockHook.stopRecording).toHaveBeenCalled();
  });

  it('shows recovery CTA when hasRecovery is true', () => {
    mockHook.hasRecovery = true;
    render(<RidesPanel />);
    openPanel();
    expect(screen.getByText('Unfinished ride found')).toBeInTheDocument();
    expect(screen.getByText('Save it')).toBeInTheDocument();
    expect(screen.getByText('Discard')).toBeInTheDocument();
  });

  it('calls recoverRide on Save it click', async () => {
    mockHook.hasRecovery = true;
    render(<RidesPanel />);
    openPanel();

    await act(async () => {
      fireEvent.click(screen.getByText('Save it'));
    });

    expect(mockHook.recoverRide).toHaveBeenCalled();
  });

  it('calls dismissRecovery on Discard click', () => {
    mockHook.hasRecovery = true;
    render(<RidesPanel />);
    openPanel();
    fireEvent.click(screen.getByText('Discard'));
    expect(mockHook.dismissRecovery).toHaveBeenCalled();
  });

  it('sends recovery feedback to the global toast host', async () => {
    mockHook.hasRecovery = true;
    mockHook.recoverRide = vi.fn().mockResolvedValue({ id: 'ride-1' });
    const toasts: string[] = [];
    const handler = (e: Event) =>
      toasts.push((e as CustomEvent).detail.message);
    window.addEventListener(MAP_EVENTS.TOAST, handler);

    try {
      render(<RidesPanel />);
      openPanel();
      await act(async () => {
        fireEvent.click(screen.getByText('Save it'));
      });
      expect(toasts).toEqual(['Ride recovered!']);
      // No in-panel copy: the panel can be closed while recording.
      expect(screen.queryByText('Ride recovered!')).toBeNull();
    } finally {
      window.removeEventListener(MAP_EVENTS.TOAST, handler);
    }
  });

  it('selects the saved ride after Finish and leaves the message to the recorder', async () => {
    mockHook.isRecording = true;
    mockHook.stopRecording = vi.fn().mockResolvedValue({ id: 'ride-2' });
    const selected: string[] = [];
    const toasts: string[] = [];
    const onSelect = (e: Event) =>
      selected.push((e as CustomEvent).detail.rideId);
    const onToast = (e: Event) =>
      toasts.push((e as CustomEvent).detail.message);
    window.addEventListener(MAP_EVENTS.RIDE_SELECT, onSelect);
    window.addEventListener(MAP_EVENTS.TOAST, onToast);

    try {
      render(<RidesPanel />);
      openPanel();
      await act(async () => {
        fireEvent.click(screen.getByText('Finish'));
      });
      expect(selected).toEqual(['ride-2']);
      expect(toasts).toEqual([]);
    } finally {
      window.removeEventListener(MAP_EVENTS.RIDE_SELECT, onSelect);
      window.removeEventListener(MAP_EVENTS.TOAST, onToast);
    }
  });

  it('dispatches RIDES_PANEL_TOGGLE on toggle', () => {
    const events: CustomEvent[] = [];
    const handler = (e: Event) => events.push(e as CustomEvent);
    window.addEventListener(MAP_EVENTS.RIDES_PANEL_TOGGLE, handler);
    try {
      render(<RidesPanel />);
      openPanel();

      expect(events).toHaveLength(1);
      expect(events[0].detail.isOpen).toBe(true);
    } finally {
      window.removeEventListener(MAP_EVENTS.RIDES_PANEL_TOGGLE, handler);
    }
  });

  it('closes (and says so) when the sidebar opens', () => {
    const events: CustomEvent[] = [];
    const handler = (e: Event) => events.push(e as CustomEvent);
    window.addEventListener(MAP_EVENTS.RIDES_PANEL_TOGGLE, handler);

    try {
      render(<RidesPanel />);
      openPanel(); // opens panel, dispatches isOpen: true
      expect(screen.getByLabelText('Close rides panel')).toBeInTheDocument();

      act(() => {
        setSidebarOpen(true);
      });

      expect(screen.getByLabelText('Open rides panel')).toBeInTheDocument();
      const closeEvent = events.find((e) => e.detail.isOpen === false);
      expect(closeEvent).toBeDefined();
    } finally {
      window.removeEventListener(MAP_EVENTS.RIDES_PANEL_TOGGLE, handler);
    }
  });

  it('opens itself when a ride is selected with openPanel', () => {
    render(<RidesPanel />);
    act(() => {
      window.dispatchEvent(
        new CustomEvent(MAP_EVENTS.RIDE_SELECT, {
          detail: { rideId: 'ride-1', openPanel: true },
        }),
      );
    });
    expect(screen.getByLabelText('Close rides panel')).toBeInTheDocument();
  });
});

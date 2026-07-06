import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { RidesPanel } from './RidesPanel';
import { MAP_EVENTS } from '@/events';

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
  useToast: () => ({
    message: null,
    isFadingOut: false,
    showToast: vi.fn(),
  }),
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

  it('dispatches panel-close when sidebar opens', () => {
    const events: CustomEvent[] = [];
    const handler = (e: Event) => events.push(e as CustomEvent);
    window.addEventListener(MAP_EVENTS.RIDES_PANEL_TOGGLE, handler);

    try {
      render(<RidesPanel />);
      openPanel(); // opens panel, dispatches isOpen: true

      act(() => {
        window.dispatchEvent(
          new CustomEvent(MAP_EVENTS.SIDEBAR_TOGGLE, {
            detail: { isOpen: true },
          }),
        );
      });

      // Should have dispatched isOpen: false after the sidebar opened
      const closeEvent = events.find((e) => e.detail.isOpen === false);
      expect(closeEvent).toBeDefined();
    } finally {
      window.removeEventListener(MAP_EVENTS.RIDES_PANEL_TOGGLE, handler);
    }
  });
});

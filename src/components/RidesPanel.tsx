'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { MAP_EVENTS } from '@/events';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTimes, faStopwatch } from '@fortawesome/free-solid-svg-icons';
import { useRideRecording, useToast } from '@/hooks';
import { formatElapsed, formatDistance, formatElevation } from '@/utils/format';
import { RideHistory } from './sidebar/RideHistory';

export function RidesPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedRideId, setSelectedRideId] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const {
    message: toastMessage,
    isFadingOut: toastFadingOut,
    showToast,
  } = useToast();

  const {
    isRecording,
    isPaused,
    elapsedTime,
    liveDistance,
    liveElevationGain,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
  } = useRideRecording(showToast);

  const isOpenRef = useRef(isOpen);
  isOpenRef.current = isOpen;

  const toggle = useCallback(() => {
    const next = !isOpenRef.current;
    setIsOpen(next);
    window.dispatchEvent(
      new CustomEvent(MAP_EVENTS.RIDES_PANEL_TOGGLE, {
        detail: { isOpen: next },
      }),
    );
  }, []);

  // Close when main sidebar opens
  useEffect(() => {
    const handler = (e: Event) => {
      const { isOpen: sidebarOpen } = (e as CustomEvent).detail;
      if (sidebarOpen && isOpenRef.current) {
        setIsOpen(false);
      }
    };
    window.addEventListener(MAP_EVENTS.SIDEBAR_TOGGLE, handler);
    return () => window.removeEventListener(MAP_EVENTS.SIDEBAR_TOGGLE, handler);
  }, []);

  // Close on outside click (mobile)
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (window.innerWidth > 768) return;
      if (!isOpen) return;
      if (toggleRef.current?.contains(event.target as Node)) return;
      if (panelRef.current?.contains(event.target as Node)) return;
      toggle();
    };
    document.addEventListener('pointerdown', handleClickOutside);
    return () =>
      document.removeEventListener('pointerdown', handleClickOutside);
  }, [isOpen, toggle]);

  // Listen for ride select/deselect
  useEffect(() => {
    const handleSelect = (e: Event) => {
      const { rideId } = (e as CustomEvent).detail;
      setSelectedRideId(rideId);
    };
    const handleDeselect = () => setSelectedRideId(null);

    window.addEventListener(MAP_EVENTS.RIDE_SELECT, handleSelect);
    window.addEventListener(MAP_EVENTS.RIDE_DESELECT, handleDeselect);
    return () => {
      window.removeEventListener(MAP_EVENTS.RIDE_SELECT, handleSelect);
      window.removeEventListener(MAP_EVENTS.RIDE_DESELECT, handleDeselect);
    };
  }, []);

  const handleRideSelect = useCallback(
    (rideId: string) => {
      setSelectedRideId(rideId);
      window.dispatchEvent(
        new CustomEvent(MAP_EVENTS.RIDE_SELECT, { detail: { rideId } }),
      );
      window.dispatchEvent(new CustomEvent(MAP_EVENTS.ROUTE_DESELECT));
      window.dispatchEvent(new CustomEvent(MAP_EVENTS.TRAIL_DESELECT));
      if (window.innerWidth <= 768 && isOpen) {
        toggle();
      }
    },
    [isOpen, toggle],
  );

  const handleRecordClick = useCallback(() => {
    if (isRecording) {
      const ride = stopRecording();
      if (ride) {
        showToast('Ride saved!');
        window.dispatchEvent(
          new CustomEvent(MAP_EVENTS.RIDE_SELECT, {
            detail: { rideId: ride.id },
          }),
        );
      } else {
        showToast('Ride too short to save — keep recording longer');
      }
    } else {
      startRecording();
    }
  }, [isRecording, stopRecording, startRecording, showToast]);

  return (
    <>
      {/* Toggle button — below the main sidebar toggle */}
      <div className="rides-toggle-container">
        <button
          ref={toggleRef}
          onClick={toggle}
          className={`toggle-button ${isRecording && !isOpen ? 'recording-active' : ''}`}
          type="button"
          aria-label={isOpen ? 'Close rides panel' : 'Open rides panel'}
        >
          <FontAwesomeIcon
            icon={isOpen ? faTimes : faStopwatch}
            className="toggle-button-icon"
          />
        </button>
      </div>

      {/* Panel */}
      <div
        ref={panelRef}
        className={`rides-panel-container ${isOpen ? 'sidebar-visible' : 'sidebar-hidden'}`}
      >
        <div className="rides-panel-header">
          <h2>My Rides</h2>
        </div>

        {toastMessage && (
          <div
            className={`rides-panel-toast ${toastFadingOut ? 'fade-out' : ''}`}
          >
            {toastMessage}
          </div>
        )}

        <div className="rides-panel-content">
          {/* Ride list */}
          <RideHistory
            selectedRideId={selectedRideId}
            onRideSelect={handleRideSelect}
          />
        </div>

        {/* Recording controls — fixed at bottom */}
        <div className="rides-panel-footer">
          {isRecording ? (
            <div className="rides-recording-active">
              <div className="rides-recording-stats">
                <div className="rides-recording-stat">
                  <span className="rides-recording-stat-value">
                    {formatElapsed(elapsedTime)}
                  </span>
                  <span className="rides-recording-stat-label">Time</span>
                </div>
                <div className="rides-recording-stat">
                  <span className="rides-recording-stat-value">
                    {formatDistance(liveDistance)}
                  </span>
                  <span className="rides-recording-stat-label">Distance</span>
                </div>
                <div className="rides-recording-stat">
                  <span className="rides-recording-stat-value">
                    {formatElevation(liveElevationGain)}
                  </span>
                  <span className="rides-recording-stat-label">Climbing</span>
                </div>
              </div>
              <div className="rides-recording-buttons">
                <button
                  type="button"
                  className="rides-recording-pause-btn"
                  onClick={isPaused ? resumeRecording : pauseRecording}
                >
                  {isPaused ? 'Resume' : 'Pause'}
                </button>
                <button
                  type="button"
                  className="rides-recording-finish-btn"
                  onClick={handleRecordClick}
                >
                  Finish
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="rides-record-btn"
              onClick={handleRecordClick}
            >
              <div className="rides-record-dot" />
              <span>Record a Ride</span>
            </button>
          )}
        </div>
      </div>
    </>
  );
}

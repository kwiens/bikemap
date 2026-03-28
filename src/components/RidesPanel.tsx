'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { MAP_EVENTS } from '@/events';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTimes, faStopwatch } from '@fortawesome/free-solid-svg-icons';
import { cn } from '@/lib/utils';
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
      {/* Toggle button */}
      <div className="fixed top-4 right-4 z-[1701]">
        <button
          ref={toggleRef}
          onClick={toggle}
          className={cn(
            'toggle-button',
            isRecording &&
              !isOpen &&
              'bg-red-500 animate-recording-pulse [&_.toggle-button-icon]:text-white',
          )}
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
        className={cn(
          'fixed top-0 right-0 h-full w-[280px] bg-white shadow-[-2px_0_5px_rgba(0,0,0,0.1)] z-[1700] overflow-hidden transition-transform duration-300 ease-in-out flex flex-col',
          'max-md:w-full max-md:max-w-[320px]',
          isOpen ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        <div className="px-4 pt-4 pb-2 border-b border-gray-200">
          <h2 className="m-0 text-base font-semibold text-gray-700">
            My Rides
          </h2>
        </div>

        {toastMessage && (
          <div
            className={cn(
              'mx-4 mt-2 px-3 py-2 bg-gray-700 text-white rounded-md text-[13px] text-center animate-toast-slide-in',
              toastFadingOut &&
                'opacity-0 transition-opacity duration-300 ease-in',
            )}
          >
            {toastMessage}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-4 py-3">
          <RideHistory
            selectedRideId={selectedRideId}
            onRideSelect={handleRideSelect}
          />
        </div>

        {/* Recording controls */}
        <div className="px-4 py-3 border-t border-gray-200">
          {isRecording ? (
            <div className="flex flex-col gap-2.5">
              <div className="flex justify-between text-center">
                <RecordingStat
                  value={formatElapsed(elapsedTime)}
                  label="Time"
                />
                <RecordingStat
                  value={formatDistance(liveDistance)}
                  label="Distance"
                />
                <RecordingStat
                  value={formatElevation(liveElevationGain)}
                  label="Climbing"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="flex-1 p-2.5 rounded-lg text-sm font-semibold cursor-pointer border-none transition-colors bg-gray-100 text-gray-700 hover:bg-gray-200"
                  onClick={isPaused ? resumeRecording : pauseRecording}
                >
                  {isPaused ? 'Resume' : 'Pause'}
                </button>
                <button
                  type="button"
                  className="flex-1 p-2.5 rounded-lg text-sm font-semibold cursor-pointer border-none transition-colors bg-red-500 text-white hover:bg-red-600"
                  onClick={handleRecordClick}
                >
                  Finish
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="w-full flex items-center gap-2 py-5 px-3.5 border border-gray-200 rounded-lg bg-white cursor-pointer text-[15px] font-medium text-gray-700 transition-colors hover:bg-gray-50"
              onClick={handleRecordClick}
            >
              <div className="w-3 h-3 rounded-full bg-red-500 shrink-0" />
              <span>Record a Ride</span>
            </button>
          )}
        </div>
      </div>
    </>
  );
}

function RecordingStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col flex-1">
      <span className="text-base font-bold tabular-nums text-gray-700">
        {value}
      </span>
      <span className="text-[11px] text-gray-500 mt-px">{label}</span>
    </div>
  );
}

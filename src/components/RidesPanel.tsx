'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { MAP_EVENTS } from '@/events';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faTimes,
  faStopwatch,
  faPause,
  faPlay,
  faFlagCheckered,
} from '@fortawesome/free-solid-svg-icons';
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
    hasRecovery,
    elapsedTime,
    liveDistance,
    liveElevationGain,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    recoverRide,
    dismissRecovery,
  } = useRideRecording(showToast);

  const isOpenRef = useRef(isOpen);
  isOpenRef.current = isOpen;

  const isRecordingRef = useRef(false);
  isRecordingRef.current = isRecording;

  const toggle = useCallback(() => {
    const next = !isOpenRef.current;
    setIsOpen(next);
    window.dispatchEvent(
      new CustomEvent(MAP_EVENTS.RIDES_PANEL_TOGGLE, {
        detail: { isOpen: next },
      }),
    );
  }, []);

  const handleRecoverRide = useCallback(async () => {
    const ride = await recoverRide();
    if (ride) {
      showToast('Ride recovered!');
      window.dispatchEvent(
        new CustomEvent(MAP_EVENTS.RIDE_SELECT, {
          detail: { rideId: ride.id },
        }),
      );
    }
  }, [recoverRide, showToast]);

  useEffect(() => {
    const handler = (e: Event) => {
      const { isOpen: sidebarOpen } = (e as CustomEvent).detail;
      if (sidebarOpen && isOpenRef.current) {
        setIsOpen(false);
        window.dispatchEvent(
          new CustomEvent(MAP_EVENTS.RIDES_PANEL_TOGGLE, {
            detail: { isOpen: false },
          }),
        );
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

  const handleRecordClick = useCallback(async () => {
    if (isRecording) {
      const ride = await stopRecording();
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
      <div className="fixed top-5 right-4 z-[1701]">
        <button
          ref={toggleRef}
          onClick={toggle}
          className={cn(
            'toggle-button',
            isRecording &&
              !isOpen &&
              'animate-recording-pulse [&_.toggle-button-icon]:text-red-500',
            isRecording && isOpen && '[&_.toggle-button-icon]:text-red-500',
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

      {/* Floating recording HUD — visible when recording with panel closed */}
      {isRecording && !isOpen && (
        <div className="fixed top-[22px] left-1/2 -translate-x-1/2 z-[1700] bg-white rounded-xl shadow-lg h-10 px-3 flex items-center gap-2.5 text-sm max-md:left-2 max-md:right-[68px] max-md:translate-x-0">
          <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse-dot shrink-0 self-center mt-px" />
          <span className="font-bold tabular-nums text-gray-700">
            {formatElapsed(elapsedTime)}
          </span>
          <span className="tabular-nums text-gray-500">
            {formatDistance(liveDistance)}
          </span>
          <span className="tabular-nums text-gray-500">
            {formatElevation(liveElevationGain)}
          </span>
          <div className="flex gap-1.5 ml-auto">
            <button
              type="button"
              className="w-8 h-8 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center cursor-pointer border-none hover:bg-gray-200 text-xs"
              onClick={isPaused ? resumeRecording : pauseRecording}
              aria-label={isPaused ? 'Resume' : 'Pause'}
            >
              <FontAwesomeIcon icon={isPaused ? faPlay : faPause} />
            </button>
            <button
              type="button"
              className="w-8 h-8 rounded-full bg-red-500 text-white flex items-center justify-center cursor-pointer border-none hover:bg-red-600 text-xs"
              onClick={handleRecordClick}
              aria-label="Finish ride"
            >
              <FontAwesomeIcon icon={faFlagCheckered} />
            </button>
          </div>
        </div>
      )}

      {/* Panel */}
      <div
        ref={panelRef}
        className={cn(
          'fixed top-0 right-0 h-full w-[280px] bg-white shadow-[-2px_0_5px_rgba(0,0,0,0.1)] z-[1700] overflow-hidden transition-transform duration-300 ease-in-out flex flex-col',
          'max-md:w-full max-md:max-w-[320px]',
          isOpen ? 'translate-x-0' : 'translate-x-full pointer-events-none',
        )}
      >
        <div className="px-4 pt-4 pb-2 border-b border-gray-200">
          <h2 className="m-0 text-base font-semibold text-gray-700">
            My Rides
          </h2>
        </div>

        <div className="relative flex-1 overflow-y-auto px-4 py-3">
          {toastMessage && (
            <div
              className={cn(
                'absolute top-2 left-4 right-4 px-3 py-2 bg-gray-700 text-white rounded-md text-[13px] text-center animate-toast-slide-in z-10',
                toastFadingOut &&
                  'opacity-0 transition-opacity duration-300 ease-in',
              )}
            >
              {toastMessage}
            </div>
          )}
          {hasRecovery && !isRecording && (
            <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm">
              <p className="font-medium text-amber-800 mb-2">
                Unfinished ride found
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="flex-1 px-3 py-1.5 bg-amber-500 text-white rounded text-xs font-medium hover:bg-amber-600"
                  onClick={handleRecoverRide}
                >
                  Save it
                </button>
                <button
                  type="button"
                  className="flex-1 px-3 py-1.5 bg-white border border-gray-200 rounded text-xs font-medium text-gray-600 hover:bg-gray-50"
                  onClick={dismissRecovery}
                >
                  Discard
                </button>
              </div>
            </div>
          )}
          <RideHistory
            selectedRideId={selectedRideId}
            onRideSelect={handleRideSelect}
            isRecording={isRecording}
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
              <p className="text-[11px] text-gray-400 text-center mt-1 leading-tight">
                Keep your phone on to track GPS. The screen will stay on.
              </p>
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

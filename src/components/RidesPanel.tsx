'use client';

import { useState, useRef, useCallback, memo } from 'react';
import { MAP_EVENTS, dispatchMapEvent } from '@/events';
import { useMapEvent } from '@/hooks/useMapEvent';
import {
  getLayout,
  isMobileViewport,
  setRidesPanelOpen,
  toggleRidesPanel,
  useLayout,
} from '@/hooks/useLayout';
import { useOutsideTap } from '@/hooks/useOutsideTap';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faTimes,
  faStopwatch,
  faPause,
  faPlay,
  faFlagCheckered,
} from '@fortawesome/free-solid-svg-icons';
import { TOGGLE_BTN_CLASS, TOGGLE_ICON_CLASS } from './styles';
import { cn } from '@/lib/utils';
import { useRideRecording } from '@/hooks';
import { formatElapsed, formatDistance, formatElevation } from '@/utils/format';
import { RideHistory } from './sidebar/RideHistory';

const PulseDot = memo(function PulseDot() {
  return (
    <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse-dot shrink-0 self-center mt-px" />
  );
});

export function RidesPanel() {
  const { ridesPanelOpen: isOpen } = useLayout();
  const [selectedRideId, setSelectedRideId] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  // Recording feedback goes through the map's toast host rather than a toast
  // of our own: while recording from the HUD this panel is closed (translated
  // off-screen), so anything rendered inside it — including a GPS failure —
  // was invisible exactly when it mattered.
  const notify = useCallback((message: string) => {
    dispatchMapEvent(MAP_EVENTS.TOAST, { message });
  }, []);

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
    continueRide,
    dismissRecovery,
  } = useRideRecording(notify);

  const toggle = toggleRidesPanel;

  const handleRecoverRide = useCallback(async () => {
    const ride = await recoverRide();
    if (ride) {
      notify('Ride recovered!');
      dispatchMapEvent(MAP_EVENTS.RIDE_SELECT, { rideId: ride.id });
    }
  }, [recoverRide, notify]);

  const handleContinueRide = useCallback(async () => {
    await continueRide();
    notify('Ride resumed — keep going!');
  }, [continueRide, notify]);

  // On a phone the panel overlays the map; a tap on the map dismisses it.
  const closeOnMobile = useCallback(() => {
    if (isMobileViewport()) setRidesPanelOpen(false);
  }, []);
  useOutsideTap(
    [panelRef, toggleRef],
    () => getLayout().ridesPanelOpen,
    closeOnMobile,
  );

  useMapEvent(MAP_EVENTS.RIDE_SELECT, ({ rideId, openPanel }) => {
    setSelectedRideId(rideId);
    if (openPanel) setRidesPanelOpen(true);
  });
  useMapEvent(MAP_EVENTS.RIDE_DESELECT, () => setSelectedRideId(null));

  const handleRideSelect = useCallback(
    (rideId: string) => {
      setSelectedRideId(rideId);
      dispatchMapEvent(MAP_EVENTS.RIDE_SELECT, { rideId });
      dispatchMapEvent(MAP_EVENTS.ROUTE_DESELECT);
      dispatchMapEvent(MAP_EVENTS.TRAIL_DESELECT);
      closeOnMobile();
    },
    [closeOnMobile],
  );

  // The recorder reports the outcome (saved / too short / save failed) through
  // `notify` itself, so only the follow-up selection lives here.
  const handleRecordClick = useCallback(async () => {
    if (isRecording) {
      const ride = await stopRecording();
      if (ride) {
        dispatchMapEvent(MAP_EVENTS.RIDE_SELECT, { rideId: ride.id });
      }
    } else {
      startRecording();
    }
  }, [isRecording, stopRecording, startRecording]);

  return (
    <>
      {/* Toggle button */}
      <div
        className={cn(
          'fixed right-4 top-[calc(1.25rem+env(safe-area-inset-top))]',
          isOpen ? 'z-[960]' : 'z-[900]',
          isRecording && !isOpen && 'animate-recording-pulse rounded-full',
        )}
      >
        <button
          ref={toggleRef}
          onClick={toggle}
          className={cn(
            TOGGLE_BTN_CLASS,
            isRecording && '[&_svg]:text-red-500',
          )}
          type="button"
          aria-label={isOpen ? 'Close rides panel' : 'Open rides panel'}
        >
          <FontAwesomeIcon
            icon={isOpen ? faTimes : faStopwatch}
            className={TOGGLE_ICON_CLASS}
          />
        </button>
      </div>

      {/* Floating recording HUD — visible when recording with panel closed */}
      {isRecording && !isOpen && (
        <div className="fixed top-[calc(22px+env(safe-area-inset-top))] left-1/2 -translate-x-1/2 z-[800] bg-white rounded-xl shadow-lg h-10 px-3 flex items-center gap-2.5 text-sm max-md:top-[calc(76px+env(safe-area-inset-top))] max-md:left-2 max-md:right-2 max-md:translate-x-0">
          <PulseDot />
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
          'fixed top-0 right-0 h-full w-[280px] bg-white shadow-[-2px_0_5px_rgba(0,0,0,0.1)] z-[950] overflow-hidden transition-transform duration-300 ease-in-out flex flex-col',
          'max-md:w-full max-md:max-w-[320px]',
          isOpen ? 'translate-x-0' : 'translate-x-full pointer-events-none',
        )}
      >
        <div className="px-4 pb-2 border-b border-gray-200 pt-[calc(1rem+env(safe-area-inset-top))]">
          <h2 className="m-0 text-base font-semibold text-gray-700">
            My Rides
          </h2>
        </div>

        <div className="relative flex-1 overflow-y-auto px-4 py-3">
          {hasRecovery && !isRecording && (
            <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm">
              <p className="font-medium text-amber-800 mb-2">
                Unfinished ride found
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="flex-1 px-3 py-1.5 bg-green-500 text-white rounded text-xs font-medium hover:bg-green-600"
                  onClick={handleContinueRide}
                >
                  Continue
                </button>
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

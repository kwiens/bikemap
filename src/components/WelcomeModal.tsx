'use client';

import React, { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBicycle,
  faMountain,
  faRoute,
  faMapMarkerAlt,
} from '@fortawesome/free-solid-svg-icons';
import { cn } from '@/lib/utils';
import { MAP_EVENTS } from '@/events';

const STORAGE_KEY = 'bikechatt-welcome-dismissed';
const RIDE_STYLE_COOKIE = 'bikechatt-ride-style';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

export type RideStyle = 'casual' | 'mountain';

export function getRideStyle(): RideStyle | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${RIDE_STYLE_COOKIE}=([^;]*)`),
  );
  return (match?.[1] as RideStyle) ?? null;
}

function setRideStyleCookie(style: RideStyle) {
  document.cookie = `${RIDE_STYLE_COOKIE}=${style}; path=/; max-age=${COOKIE_MAX_AGE}`;
}

export function WelcomeModal() {
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(STORAGE_KEY)) {
      setVisible(true);
    }
  }, []);

  const choose = (style: RideStyle) => {
    localStorage.setItem(STORAGE_KEY, '1');
    setRideStyleCookie(style);
    window.dispatchEvent(
      new CustomEvent(MAP_EVENTS.RIDE_STYLE_CHOSEN, {
        detail: { style },
      }),
    );
    setExiting(true);
    setTimeout(() => {
      setVisible(false);
    }, 400);
  };

  if (!visible) return null;

  return (
    <div
      className={cn(
        'fixed inset-0 z-[3000] flex items-center justify-center bg-black/60 backdrop-blur-[4px] p-5',
        exiting ? 'animate-welcome-fade-out' : 'animate-welcome-fade-in',
      )}
    >
      {/* biome-ignore lint/a11y/noStaticElementInteractions: stop propagation for content area */}
      <div
        className={cn(
          'bg-white rounded-3xl w-full max-w-[400px] px-7 pt-10 pb-8 text-center shadow-[0_24px_48px_rgba(0,0,0,0.25)] animate-welcome-slide-up',
          exiting && 'animate-welcome-slide-down',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-8">
          <span className="inline-flex items-center justify-center w-[72px] h-[72px] rounded-full bg-app-primary text-app-secondary text-[32px] mb-4">
            <FontAwesomeIcon icon={faBicycle} />
          </span>
          <h1 className="text-[32px] font-bold text-app-secondary mb-1.5 tracking-tight">
            Bike Chatt
          </h1>
          <p className="text-[17px] text-gray-500 font-normal">
            Your guide to biking Chattanooga
          </p>
        </div>

        <div className="flex flex-col gap-4 mb-7 text-left">
          <div className="flex items-center gap-4">
            <div
              className="shrink-0 w-12 h-12 rounded-[14px] flex items-center justify-center text-white text-xl"
              style={{ background: '#2563EB' }}
            >
              <FontAwesomeIcon icon={faRoute} />
            </div>
            <div className="flex flex-col gap-0.5">
              <strong className="text-base font-semibold text-app-secondary">
                Plan Fun Routes
              </strong>
              <span className="text-sm text-gray-500 leading-snug">
                Scenic loops to the zoo, aquarium, riverwalk &amp; more
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div
              className="shrink-0 w-12 h-12 rounded-[14px] flex items-center justify-center text-white text-xl"
              style={{ background: '#059669' }}
            >
              <FontAwesomeIcon icon={faBicycle} />
            </div>
            <div className="flex flex-col gap-0.5">
              <strong className="text-base font-semibold text-app-secondary">
                Find Safe Paths
              </strong>
              <span className="text-sm text-gray-500 leading-snug">
                Low-traffic greenways and protected bike trails
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div
              className="shrink-0 w-12 h-12 rounded-[14px] flex items-center justify-center text-white text-xl"
              style={{ background: '#7C3AED' }}
            >
              <FontAwesomeIcon icon={faMapMarkerAlt} />
            </div>
            <div className="flex flex-col gap-0.5">
              <strong className="text-base font-semibold text-app-secondary">
                Grab a Bike
              </strong>
              <span className="text-sm text-gray-500 leading-snug">
                24/7 city bike rental stations across downtown
              </span>
            </div>
          </div>
        </div>

        <p className="text-[17px] font-semibold text-app-secondary mb-4">
          How do you want to ride?
        </p>

        <div className="flex gap-4 mb-6">
          <button
            type="button"
            className="flex-1 flex flex-col items-center gap-2.5 py-6 px-4 border-2 border-gray-200 rounded-2xl bg-white cursor-pointer transition-all duration-150 hover:border-app-primary hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)] active:scale-[0.97] active:border-[#a5d730]"
            onClick={() => choose('casual')}
          >
            <span
              className="inline-flex items-center justify-center w-14 h-14 rounded-full text-white text-2xl"
              style={{ background: '#2563EB' }}
            >
              <FontAwesomeIcon icon={faBicycle} />
            </span>
            <strong className="text-lg font-bold text-app-secondary">
              Casual
            </strong>
            <span className="text-[13px] text-gray-500 leading-snug">
              Scenic loops, greenways &amp; city rides
            </span>
          </button>

          <button
            type="button"
            className="flex-1 flex flex-col items-center gap-2.5 py-6 px-4 border-2 border-gray-200 rounded-2xl bg-white cursor-pointer transition-all duration-150 hover:border-app-primary hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)] active:scale-[0.97] active:border-[#a5d730]"
            onClick={() => choose('mountain')}
          >
            <span
              className="inline-flex items-center justify-center w-14 h-14 rounded-full text-white text-2xl"
              style={{ background: '#059669' }}
            >
              <FontAwesomeIcon icon={faMountain} />
            </span>
            <strong className="text-lg font-bold text-app-secondary">
              Mountain
            </strong>
            <span className="text-[13px] text-gray-500 leading-snug">
              Singletrack trails &amp; off-road adventures
            </span>
          </button>
        </div>

        <p className="text-[13px] text-gray-400">You can always switch later</p>
      </div>
    </div>
  );
}

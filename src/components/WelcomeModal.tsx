'use client';

import React, { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBicycle,
  faMountain,
  faRoute,
  faMapMarkerAlt,
  type IconDefinition,
} from '@fortawesome/free-solid-svg-icons';
import { cn } from '@/lib/utils';
import { MAP_EVENTS } from '@/events';

const features: {
  icon: IconDefinition;
  bg: string;
  title: string;
  desc: string;
}[] = [
  {
    icon: faRoute,
    bg: 'bg-blue-600',
    title: 'Plan Fun Routes',
    desc: 'Scenic loops to the zoo, aquarium, riverwalk & more',
  },
  {
    icon: faBicycle,
    bg: 'bg-emerald-600',
    title: 'Find Safe Paths',
    desc: 'Low-traffic greenways and protected bike trails',
  },
  {
    icon: faMapMarkerAlt,
    bg: 'bg-violet-600',
    title: 'Grab a Bike',
    desc: '24/7 city bike rental stations across downtown',
  },
];

const choices: {
  style: RideStyle;
  icon: IconDefinition;
  bg: string;
  label: string;
  desc: string;
}[] = [
  {
    style: 'casual',
    icon: faBicycle,
    bg: 'bg-blue-600',
    label: 'Casual',
    desc: 'Scenic loops, greenways & city rides',
  },
  {
    style: 'mountain',
    icon: faMountain,
    bg: 'bg-emerald-600',
    label: 'Mountain',
    desc: 'Singletrack trails & off-road adventures',
  },
];

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
          {features.map((f) => (
            <div key={f.title} className="flex items-center gap-4">
              <div
                className={cn(
                  'shrink-0 w-12 h-12 rounded-[14px] flex items-center justify-center text-white text-xl',
                  f.bg,
                )}
              >
                <FontAwesomeIcon icon={f.icon} />
              </div>
              <div className="flex flex-col gap-0.5">
                <strong className="text-base font-semibold text-app-secondary">
                  {f.title}
                </strong>
                <span className="text-sm text-gray-500 leading-snug">
                  {f.desc}
                </span>
              </div>
            </div>
          ))}
        </div>

        <p className="text-[17px] font-semibold text-app-secondary mb-4">
          How do you want to ride?
        </p>

        <div className="flex gap-4 mb-6">
          {choices.map((c) => (
            <button
              key={c.style}
              type="button"
              className="flex-1 flex flex-col items-center gap-2.5 py-6 px-4 border-2 border-gray-200 rounded-2xl bg-white cursor-pointer transition-all duration-150 hover:border-app-primary hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)] active:scale-[0.97] active:border-[#a5d730]"
              onClick={() => choose(c.style)}
            >
              <span
                className={cn(
                  'inline-flex items-center justify-center w-14 h-14 rounded-full text-white text-2xl',
                  c.bg,
                )}
              >
                <FontAwesomeIcon icon={c.icon} />
              </span>
              <strong className="text-lg font-bold text-app-secondary">
                {c.label}
              </strong>
              <span className="text-[13px] text-gray-500 leading-snug">
                {c.desc}
              </span>
            </button>
          ))}
        </div>

        <p className="text-[13px] text-gray-400">You can always switch later</p>
      </div>
    </div>
  );
}

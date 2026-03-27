'use client';

import React, { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBicycle,
  faMountain,
  faRoute,
  faMapMarkerAlt,
} from '@fortawesome/free-solid-svg-icons';
import { MAP_EVENTS } from '@/events';
import './welcome-modal.css';

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
    // biome-ignore lint/a11y/noStaticElementInteractions: overlay dismiss on click
    <div
      className={`welcome-overlay ${exiting ? 'welcome-exit' : 'welcome-enter'}`}
    >
      {/* biome-ignore lint/a11y/noStaticElementInteractions: stop propagation for content area */}
      <div className="welcome-content" onClick={(e) => e.stopPropagation()}>
        <div className="welcome-header">
          <span className="welcome-bike-icon">
            <FontAwesomeIcon icon={faBicycle} />
          </span>
          <h1 className="welcome-title">Bike Chatt</h1>
          <p className="welcome-subtitle">Your guide to biking Chattanooga</p>
        </div>

        <div className="welcome-features">
          <div className="welcome-feature">
            <div
              className="welcome-feature-icon"
              style={{ background: '#2563EB' }}
            >
              <FontAwesomeIcon icon={faRoute} />
            </div>
            <div className="welcome-feature-text">
              <strong>Plan Fun Routes</strong>
              <span>
                Scenic loops to the zoo, aquarium, riverwalk &amp; more
              </span>
            </div>
          </div>

          <div className="welcome-feature">
            <div
              className="welcome-feature-icon"
              style={{ background: '#059669' }}
            >
              <FontAwesomeIcon icon={faBicycle} />
            </div>
            <div className="welcome-feature-text">
              <strong>Find Safe Paths</strong>
              <span>Low-traffic greenways and protected bike trails</span>
            </div>
          </div>

          <div className="welcome-feature">
            <div
              className="welcome-feature-icon"
              style={{ background: '#7C3AED' }}
            >
              <FontAwesomeIcon icon={faMapMarkerAlt} />
            </div>
            <div className="welcome-feature-text">
              <strong>Grab a Bike</strong>
              <span>24/7 city bike rental stations across downtown</span>
            </div>
          </div>
        </div>

        <p className="welcome-question">How do you want to ride?</p>

        <div className="welcome-choices">
          <button
            type="button"
            className="welcome-choice"
            onClick={() => choose('casual')}
          >
            <span
              className="welcome-choice-icon"
              style={{ background: '#2563EB' }}
            >
              <FontAwesomeIcon icon={faBicycle} />
            </span>
            <strong>Casual</strong>
            <span className="welcome-choice-desc">
              Scenic loops, greenways &amp; city rides
            </span>
          </button>

          <button
            type="button"
            className="welcome-choice"
            onClick={() => choose('mountain')}
          >
            <span
              className="welcome-choice-icon"
              style={{ background: '#059669' }}
            >
              <FontAwesomeIcon icon={faMountain} />
            </span>
            <strong>Mountain</strong>
            <span className="welcome-choice-desc">
              Singletrack trails &amp; off-road adventures
            </span>
          </button>
        </div>

        <p className="welcome-dismiss-hint">You can always switch later</p>
      </div>
    </div>
  );
}

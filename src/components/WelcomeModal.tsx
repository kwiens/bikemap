'use client';

import React, { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faRoute,
  faBicycle,
  faMapMarkerAlt,
} from '@fortawesome/free-solid-svg-icons';
import './welcome-modal.css';

const STORAGE_KEY = 'bikechatt-welcome-dismissed';

export function WelcomeModal() {
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(STORAGE_KEY)) {
      setVisible(true);
    }
  }, []);

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, '1');
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
      onClick={dismiss}
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

        <button type="button" className="welcome-cta" onClick={dismiss}>
          Let&apos;s Ride!
        </button>

        <p className="welcome-dismiss-hint">Tap anywhere to dismiss</p>
      </div>
    </div>
  );
}

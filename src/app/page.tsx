'use client';

import { type ReactElement } from 'react';
import dynamic from 'next/dynamic';
import '@/app/map.css';
import React from 'react';

// Dynamically import the Map component with no SSR since Mapbox requires window
const Map = dynamic(() => import('@/components/Map'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-screen flex items-center justify-center bg-gray-100">
      Loading map...
    </div>
  ),
});

export default function Home(): ReactElement {
  // Add useEffect to handle beforeinstallprompt event
  React.useEffect(() => {
    // This event fires when the app can be installed as a PWA
    window.addEventListener('beforeinstallprompt', (e) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault();
      // For debugging only - you can remove this in production
      console.log('App is installable as PWA');
    });
  }, []);

  return (
    <main className="w-screen h-screen overflow-hidden absolute inset-0 m-0 p-0">
      <Map />
    </main>
  );
}

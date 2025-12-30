'use client';

import type { ReactElement } from 'react';
import dynamic from 'next/dynamic';
import '@/app/map.css';
import React from 'react';
import { PwaInstallPrompt } from '@/components/PwaInstallPrompt';

// Dynamically import the Map component with no SSR since Mapbox requires window
const BikeMap = dynamic(() => import('@/components/Map'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-screen flex items-center justify-center bg-gray-100">
      Loading map...
    </div>
  ),
});

export default function Home(): ReactElement {
  return (
    <main className="w-screen h-screen overflow-hidden absolute inset-0 m-0 p-0">
      <BikeMap />
      <PwaInstallPrompt />
    </main>
  );
}

'use client';

import { type ReactElement } from 'react';
import dynamic from 'next/dynamic';

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
  return (
    <main className="fixed inset-0 w-full h-full overflow-hidden">
      <Map />
    </main>
  );
}

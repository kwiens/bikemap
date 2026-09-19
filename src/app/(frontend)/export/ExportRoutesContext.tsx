'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { BikeRoute } from '@/data/bike-routes';

const ExportRoutesContext = createContext<BikeRoute[]>([]);

export function ExportRoutesProvider({
  children,
  routes,
}: {
  children: ReactNode;
  routes: BikeRoute[];
}) {
  return (
    <ExportRoutesContext.Provider value={routes}>
      {children}
    </ExportRoutesContext.Provider>
  );
}

export function useExportRoutes(): BikeRoute[] {
  return useContext(ExportRoutesContext);
}

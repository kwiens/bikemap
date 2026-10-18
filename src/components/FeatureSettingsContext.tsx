'use client';

import { createContext, type ReactNode, useContext } from 'react';
import {
  DEFAULT_FEATURE_SETTINGS,
  type FeatureSettings,
} from '@/config/features.config';

const FeatureSettingsContext = createContext<FeatureSettings>(
  DEFAULT_FEATURE_SETTINGS,
);

export function FeatureSettingsProvider({
  children,
  settings,
}: {
  children: ReactNode;
  settings: FeatureSettings;
}) {
  return (
    <FeatureSettingsContext.Provider value={settings}>
      {children}
    </FeatureSettingsContext.Provider>
  );
}

export function useFeatureSettings(): FeatureSettings {
  return useContext(FeatureSettingsContext);
}

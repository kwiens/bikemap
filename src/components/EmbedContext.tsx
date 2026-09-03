'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { DEFAULT_EMBED_OPTIONS, type EmbedOptions } from '@/utils/embed';

// Embed mode is opt-in per route: `/embed` wraps the map in `EmbedProvider`;
// every other page gets the default (not embedded), so the main app never has
// to know this context exists.

export interface EmbedState {
  /** True only under `/embed` — the map is framed on a third-party site. */
  isEmbed: boolean;
  options: EmbedOptions;
}

const EmbedContext = createContext<EmbedState>({
  isEmbed: false,
  options: DEFAULT_EMBED_OPTIONS,
});

export function EmbedProvider({
  options,
  children,
}: {
  options: EmbedOptions;
  children: ReactNode;
}) {
  return (
    <EmbedContext.Provider value={{ isEmbed: true, options }}>
      {children}
    </EmbedContext.Provider>
  );
}

export function useEmbed(): EmbedState {
  return useContext(EmbedContext);
}

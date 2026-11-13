'use client';

import { useState, useSyncExternalStore } from 'react';
import { MAP_EVENTS, dispatchMapEvent } from '@/events';
import { setSetting } from '@/utils/settings';

/**
 * The map chrome's layout state: which side panel is open.
 *
 * The sidebar (MapLegend), the rides panel and the elevation pane are
 * siblings that each used to keep a copy of this and keep the copies in sync
 * by listening to each other's toggle events. One store owns it instead; the
 * events are still dispatched (the map resizes on SIDEBAR_TOGGLE) but nothing
 * mirrors state from them any more.
 *
 * The two panels are mutually exclusive: opening one closes the other.
 */
export interface LayoutState {
  sidebarOpen: boolean;
  ridesPanelOpen: boolean;
}

/** Viewport widths below Tailwind's `md` breakpoint lay the panels out as
 *  full-height overlays that close after a selection or an outside tap. */
const MOBILE_MAX_WIDTH_PX = 767;

export function isMobileViewport(): boolean {
  return window.innerWidth <= MOBILE_MAX_WIDTH_PX;
}

let state: LayoutState = { sidebarOpen: true, ridesPanelOpen: false };
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

/**
 * Seed the store for a fresh map mount. Dispatches nothing: the initial
 * state is not a change. MapLegendProvider calls this during its first
 * render, before any consumer reads; tests call it to reset between cases.
 */
export function initLayout(initial: Partial<LayoutState> = {}): void {
  state = { sidebarOpen: true, ridesPanelOpen: false, ...initial };
}

export function getLayout(): LayoutState {
  return state;
}

export function subscribeLayout(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

interface SidebarOptions {
  /**
   * Whether to remember the choice in the settings cookie. Only a deliberate
   * toggle by the rider is a preference; closing the sidebar because the rides
   * panel opened, or because a selection was made on a phone, is not — and
   * embed frames never persist (browsers drop the cookie there anyway).
   */
  persist?: boolean;
}

export function setSidebarOpen(
  open: boolean,
  { persist = false }: SidebarOptions = {},
): void {
  if (persist) setSetting('sidebarOpen', open);
  if (open && state.ridesPanelOpen) setRidesPanelOpen(false);
  if (state.sidebarOpen === open) return;
  state = { ...state, sidebarOpen: open };
  emit();
  dispatchMapEvent(MAP_EVENTS.SIDEBAR_TOGGLE, { isOpen: open });
}

export function toggleSidebar(options?: SidebarOptions): void {
  setSidebarOpen(!state.sidebarOpen, options);
}

export function setRidesPanelOpen(open: boolean): void {
  if (open && state.sidebarOpen) setSidebarOpen(false);
  if (state.ridesPanelOpen === open) return;
  state = { ...state, ridesPanelOpen: open };
  emit();
  dispatchMapEvent(MAP_EVENTS.RIDES_PANEL_TOGGLE, { isOpen: open });
}

export function toggleRidesPanel(): void {
  setRidesPanelOpen(!state.ridesPanelOpen);
}

/** Read the layout state and re-render when it changes. */
export function useLayout(): LayoutState {
  return useSyncExternalStore(subscribeLayout, getLayout, getLayout);
}

/**
 * Seed the store once per mount of the component that owns the map chrome,
 * during its first render so every consumer below it reads the seeded value.
 * It is the same render-time pattern HomeClient uses for trail-source. The
 * lazy useState initializer is the one React API that runs exactly once per
 * mount before children render; its value is deliberately unused.
 */
export function useSeedLayout(getInitial: () => Partial<LayoutState>): void {
  // eslint-disable-next-line @eslint-react/use-state
  useState(() => {
    initLayout(getInitial());
    return null;
  });
}

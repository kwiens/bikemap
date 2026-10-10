/**
 * The message protocol between this page and a native host (the Expo shell)
 * that embeds it in a React Native WebView.
 *
 * Every message is a JSON object tagged `source: 'bikemap'` and `v` (the
 * protocol version) so it can share a channel with anything else the host
 * posts. The page sends `HostCommand`s; the host answers with `PageEvent`s.
 * Both sides are documented for the native implementer in
 * docs/guides/native-shell.md — change this file and that guide together.
 */

import type { PositionError, PositionFix, PositionOptions } from '../types';

export const PROTOCOL_VERSION = 1;
export const MESSAGE_SOURCE = 'bikemap';

/** Which services the host fulfils. Anything false falls back to the Web API. */
export interface NativeCapabilities {
  geolocation: boolean;
  keepAwake: boolean;
  heading: boolean;
}

/**
 * Installed by the host before the page loads
 * (`injectedJavaScriptBeforeContentLoaded`). Its presence is how the page
 * knows it is inside the shell, synchronously, before the first render.
 */
export interface NativeHostInfo {
  protocolVersion: number;
  capabilities: NativeCapabilities;
}

interface Envelope {
  source: typeof MESSAGE_SOURCE;
  v: number;
}

/** Page → host. */
export type HostCommand =
  | { type: 'geolocation/watch'; watchId: number; options: PositionOptions }
  | { type: 'geolocation/clearWatch'; watchId: number }
  | {
      type: 'geolocation/getCurrent';
      requestId: number;
      options: PositionOptions;
    }
  | { type: 'keepAwake/acquire' }
  | { type: 'keepAwake/release' }
  | { type: 'heading/requestPermission'; requestId: number }
  | { type: 'heading/watch' }
  | { type: 'heading/clearWatch' };

/** Host → page. */
export type PageEvent =
  | { type: 'geolocation/fix'; watchId: number; fix: PositionFix }
  | { type: 'geolocation/error'; watchId: number; error: PositionError }
  | { type: 'geolocation/current'; requestId: number; fix: PositionFix }
  | {
      type: 'geolocation/currentError';
      requestId: number;
      error: PositionError;
    }
  | { type: 'heading/reading'; headingDegrees: number }
  | { type: 'heading/permission'; requestId: number; granted: boolean };

export type HostCommandMessage = Envelope & HostCommand;
export type PageEventMessage = Envelope & PageEvent;

export function encodeCommand(command: HostCommand): string {
  const message: HostCommandMessage = {
    source: MESSAGE_SOURCE,
    v: PROTOCOL_VERSION,
    ...command,
  };
  return JSON.stringify(message);
}

const PAGE_EVENT_TYPES = new Set<PageEvent['type']>([
  'geolocation/fix',
  'geolocation/error',
  'geolocation/current',
  'geolocation/currentError',
  'heading/reading',
  'heading/permission',
]);

/**
 * Parse something received from the host. Returns null for anything that is
 * not one of our messages — the WebView channel is shared, and a host bug
 * must not become a page crash.
 */
export function decodePageEvent(raw: unknown): PageEvent | null {
  let data: unknown = raw;
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (typeof data !== 'object' || data === null) return null;
  const message = data as Partial<PageEventMessage>;
  if (message.source !== MESSAGE_SOURCE) return null;
  if (message.v !== PROTOCOL_VERSION) return null;
  if (!message.type || !PAGE_EVENT_TYPES.has(message.type)) return null;
  return message as PageEvent;
}

/** True when the injected host info describes a protocol we can speak. */
export function isCompatibleHost(info: unknown): info is NativeHostInfo {
  if (typeof info !== 'object' || info === null) return false;
  const candidate = info as Partial<NativeHostInfo>;
  return (
    candidate.protocolVersion === PROTOCOL_VERSION &&
    typeof candidate.capabilities === 'object' &&
    candidate.capabilities !== null
  );
}

/**
 * Host-side copy of the bike map bridge protocol, version 1.
 *
 * This mirrors `src/platform/native/protocol.ts` in the bikemap repository.
 * The page is the source of truth; when it changes, update this file and bump
 * PROTOCOL_VERSION in both places. A page that does not recognise the
 * version falls back to the Web APIs, so an out-of-date host degrades rather
 * than breaks.
 */

export const PROTOCOL_VERSION = 1;
export const MESSAGE_SOURCE = 'bikemap';

export interface PositionFix {
  lng: number;
  lat: number;
  accuracy: number;
  altitude: number | null;
  altitudeAccuracy: number | null;
  speed: number | null;
  heading: number | null;
  timestamp: number;
}

export type PositionErrorCode = 'permission-denied' | 'unavailable' | 'timeout';

export interface PositionError {
  code: PositionErrorCode;
  message: string;
}

export interface PositionOptions {
  highAccuracy?: boolean;
  maximumAgeMs?: number;
  timeoutMs?: number;
}

export interface NativeCapabilities {
  geolocation: boolean;
  keepAwake: boolean;
  heading: boolean;
  share?: boolean;
}

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
  | { type: 'heading/clearWatch' }
  | {
      type: 'share/file';
      requestId: number;
      filename: string;
      mimeType: string;
      content: string;
    }
  | { type: 'share/link'; requestId: number; url: string };

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
  | { type: 'heading/permission'; requestId: number; granted: boolean }
  | { type: 'share/result'; requestId: number; ok: boolean };

export type HostCommandMessage = Envelope & HostCommand;
export type PageEventMessage = Envelope & PageEvent;

/** Parse a `postMessage` from the page; null for anything that is not ours. */
export function decodeHostCommand(raw: string): HostCommand | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null) return null;
  const message = data as Partial<HostCommandMessage>;
  if (message.source !== MESSAGE_SOURCE || message.v !== PROTOCOL_VERSION) {
    return null;
  }
  if (typeof message.type !== 'string') return null;
  return message as HostCommand;
}

export function encodePageEvent(event: PageEvent): string {
  const message: PageEventMessage = {
    source: MESSAGE_SOURCE,
    v: PROTOCOL_VERSION,
    ...event,
  };
  return JSON.stringify(message);
}

/** The JavaScript the WebView must run before the page loads. */
export function hostAnnouncementScript(capabilities: NativeCapabilities): string {
  const info: NativeHostInfo = { protocolVersion: PROTOCOL_VERSION, capabilities };
  return `window.__bikemapNative = ${JSON.stringify(info)}; true;`;
}

/** The JavaScript that delivers one event to the page. */
export function deliveryScript(event: PageEvent): string {
  // Double-encoded: the outer JSON.stringify turns the JSON string into a
  // JavaScript string literal.
  return `window.__bikemapNative && window.__bikemapNative.receive && window.__bikemapNative.receive(${JSON.stringify(encodePageEvent(event))}); true;`;
}

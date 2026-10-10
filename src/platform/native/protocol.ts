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

import type {
  PositionError,
  PositionErrorCode,
  PositionFix,
  PositionOptions,
} from '../types';

export const PROTOCOL_VERSION = 1;
export const MESSAGE_SOURCE = 'bikemap';

/** Which services the host fulfils. Anything false falls back to the Web API. */
export interface NativeCapabilities {
  geolocation: boolean;
  keepAwake: boolean;
  heading: boolean;
  /** Share sheet for GPX files and links. Added after v1 shipped its first
   *  hosts, so it is optional and defaults to off. */
  share?: boolean;
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
  /** `ok` is false when the rider dismissed the sheet or sharing failed. */
  | { type: 'share/result'; requestId: number; ok: boolean };

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

// ---------------------------------------------------------------------------
// Decoding. Each event's payload is checked field by field: a host bug (a fix
// without coordinates, a string where a number should be) must be dropped
// here, not thrown from the location marker or written into a ride.

type Dict = Record<string, unknown>;

function isDict(value: unknown): value is Dict {
  return typeof value === 'object' && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || isFiniteNumber(value);
}

const ERROR_CODES: readonly PositionErrorCode[] = [
  'permission-denied',
  'unavailable',
  'timeout',
];

function parseFix(value: unknown): PositionFix | null {
  if (!isDict(value)) return null;
  if (
    !isFiniteNumber(value.lng) ||
    !isFiniteNumber(value.lat) ||
    !isFiniteNumber(value.accuracy) ||
    !isFiniteNumber(value.timestamp) ||
    !isNullableNumber(value.altitude) ||
    !isNullableNumber(value.altitudeAccuracy) ||
    !isNullableNumber(value.speed) ||
    !isNullableNumber(value.heading)
  ) {
    return null;
  }
  return {
    lng: value.lng,
    lat: value.lat,
    accuracy: value.accuracy,
    altitude: value.altitude,
    altitudeAccuracy: value.altitudeAccuracy,
    speed: value.speed,
    heading: value.heading,
    timestamp: value.timestamp,
  };
}

function parseError(value: unknown): PositionError | null {
  if (!isDict(value)) return null;
  if (!ERROR_CODES.includes(value.code as PositionErrorCode)) return null;
  return {
    code: value.code as PositionErrorCode,
    message: typeof value.message === 'string' ? value.message : '',
  };
}

function parseEvent(message: Dict): PageEvent | null {
  switch (message.type) {
    case 'geolocation/fix': {
      const fix = parseFix(message.fix);
      if (!isFiniteNumber(message.watchId) || !fix) return null;
      return { type: 'geolocation/fix', watchId: message.watchId, fix };
    }
    case 'geolocation/error': {
      const error = parseError(message.error);
      if (!isFiniteNumber(message.watchId) || !error) return null;
      return { type: 'geolocation/error', watchId: message.watchId, error };
    }
    case 'geolocation/current': {
      const fix = parseFix(message.fix);
      if (!isFiniteNumber(message.requestId) || !fix) return null;
      return {
        type: 'geolocation/current',
        requestId: message.requestId,
        fix,
      };
    }
    case 'geolocation/currentError': {
      const error = parseError(message.error);
      if (!isFiniteNumber(message.requestId) || !error) return null;
      return {
        type: 'geolocation/currentError',
        requestId: message.requestId,
        error,
      };
    }
    case 'heading/reading':
      if (!isFiniteNumber(message.headingDegrees)) return null;
      return {
        type: 'heading/reading',
        headingDegrees: message.headingDegrees,
      };
    case 'heading/permission':
      if (
        !isFiniteNumber(message.requestId) ||
        typeof message.granted !== 'boolean'
      ) {
        return null;
      }
      return {
        type: 'heading/permission',
        requestId: message.requestId,
        granted: message.granted,
      };
    case 'share/result':
      if (
        !isFiniteNumber(message.requestId) ||
        typeof message.ok !== 'boolean'
      ) {
        return null;
      }
      return {
        type: 'share/result',
        requestId: message.requestId,
        ok: message.ok,
      };
    default:
      return null;
  }
}

/**
 * Parse something received from the host. Returns null for anything that is
 * not one of our messages, or one whose payload is malformed — the WebView
 * channel is shared, and a host bug must not become a page crash.
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
  if (!isDict(data)) return null;
  if (data.source !== MESSAGE_SOURCE || data.v !== PROTOCOL_VERSION) {
    return null;
  }
  return parseEvent(data);
}

/** True when the injected host info describes a protocol we can speak. */
export function isCompatibleHost(info: unknown): info is NativeHostInfo {
  if (!isDict(info)) return false;
  return info.protocolVersion === PROTOCOL_VERSION && isDict(info.capabilities);
}

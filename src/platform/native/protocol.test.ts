import { describe, it, expect } from 'vitest';
import {
  PROTOCOL_VERSION,
  decodePageEvent,
  encodeCommand,
  isCompatibleHost,
} from './protocol';

describe('native bridge protocol', () => {
  it('tags outgoing commands with the source and version', () => {
    expect(JSON.parse(encodeCommand({ type: 'keepAwake/acquire' }))).toEqual({
      source: 'bikemap',
      v: PROTOCOL_VERSION,
      type: 'keepAwake/acquire',
    });
  });

  it('decodes JSON strings and objects alike, stripping the envelope', () => {
    const message = {
      source: 'bikemap',
      v: PROTOCOL_VERSION,
      type: 'heading/reading',
      headingDegrees: 90,
    };
    const event = { type: 'heading/reading', headingDegrees: 90 };
    expect(decodePageEvent(JSON.stringify(message))).toEqual(event);
    expect(decodePageEvent(message)).toEqual(event);
  });

  it('ignores anything that is not one of our messages', () => {
    expect(decodePageEvent('not json')).toBeNull();
    expect(decodePageEvent(null)).toBeNull();
    expect(decodePageEvent({ type: 'heading/reading' })).toBeNull();
    expect(
      decodePageEvent({ source: 'bikemap', v: 99, type: 'heading/reading' }),
    ).toBeNull();
    expect(
      decodePageEvent({
        source: 'bikemap',
        v: PROTOCOL_VERSION,
        type: 'geolocation/watch',
      }),
    ).toBeNull();
  });

  it('drops events whose payload is malformed', () => {
    const envelope = { source: 'bikemap', v: PROTOCOL_VERSION };
    const fix = {
      lng: -85.3,
      lat: 35.0,
      accuracy: 5,
      altitude: null,
      altitudeAccuracy: null,
      speed: null,
      heading: null,
      timestamp: 1,
    };
    expect(
      decodePageEvent({ ...envelope, type: 'geolocation/fix', watchId: 1 }),
    ).toBeNull();
    expect(
      decodePageEvent({
        ...envelope,
        type: 'geolocation/fix',
        watchId: 1,
        fix: { ...fix, lng: '-85.3' },
      }),
    ).toBeNull();
    expect(
      decodePageEvent({
        ...envelope,
        type: 'geolocation/fix',
        watchId: 'one',
        fix,
      }),
    ).toBeNull();
    expect(
      decodePageEvent({
        ...envelope,
        type: 'geolocation/error',
        watchId: 1,
        error: { code: 'lost', message: '' },
      }),
    ).toBeNull();
    expect(
      decodePageEvent({
        ...envelope,
        type: 'heading/reading',
        headingDegrees: 'north',
      }),
    ).toBeNull();
    expect(
      decodePageEvent({
        ...envelope,
        type: 'heading/permission',
        requestId: 1,
        granted: 'yes',
      }),
    ).toBeNull();

    // Well-formed payloads come back with only the known fields.
    expect(
      decodePageEvent({
        ...envelope,
        type: 'geolocation/fix',
        watchId: 1,
        fix: { ...fix, extra: true },
      }),
    ).toEqual({ type: 'geolocation/fix', watchId: 1, fix });
    expect(
      decodePageEvent({
        ...envelope,
        type: 'geolocation/currentError',
        requestId: 2,
        error: { code: 'timeout' },
      }),
    ).toEqual({
      type: 'geolocation/currentError',
      requestId: 2,
      error: { code: 'timeout', message: '' },
    });
  });

  it('accepts only a host speaking the current protocol', () => {
    expect(
      isCompatibleHost({
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { geolocation: true, keepAwake: true, heading: false },
      }),
    ).toBe(true);
    expect(isCompatibleHost({ protocolVersion: 0, capabilities: {} })).toBe(
      false,
    );
    expect(isCompatibleHost({ protocolVersion: PROTOCOL_VERSION })).toBe(false);
    expect(isCompatibleHost(undefined)).toBe(false);
  });
});

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

  it('decodes JSON strings and objects alike', () => {
    const event = {
      source: 'bikemap',
      v: PROTOCOL_VERSION,
      type: 'heading/reading',
      headingDegrees: 90,
    };
    expect(decodePageEvent(JSON.stringify(event))).toEqual(event);
    expect(decodePageEvent(event)).toEqual(event);
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

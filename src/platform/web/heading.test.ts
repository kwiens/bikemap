/** @vitest-environment jsdom */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { createWebHeading } from './heading';

function orientationEvent(fields: Record<string, unknown>) {
  const event = new Event('deviceorientation');
  Object.assign(event, fields);
  return event;
}

describe('createWebHeading', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('prefers Safari’s compass heading and otherwise derives it from alpha', () => {
    vi.stubGlobal('DeviceOrientationEvent', class {});
    const service = createWebHeading();
    const headings: number[] = [];
    const stop = service.watchHeading((h) => headings.push(h));

    window.dispatchEvent(
      orientationEvent({ webkitCompassHeading: 45, alpha: 10 }),
    );
    window.dispatchEvent(orientationEvent({ alpha: 90 }));
    window.dispatchEvent(orientationEvent({ alpha: null }));
    expect(headings).toEqual([45, 270]);

    stop();
    window.dispatchEvent(orientationEvent({ alpha: 0 }));
    expect(headings).toEqual([45, 270]);
  });

  it('listens only to the absolute event where the browser has one', () => {
    vi.stubGlobal('DeviceOrientationEvent', class {});
    (
      window as unknown as { ondeviceorientationabsolute: null }
    ).ondeviceorientationabsolute = null;
    try {
      const headings: number[] = [];
      const stop = createWebHeading().watchHeading((h) => headings.push(h));
      const absolute = new Event('deviceorientationabsolute');
      Object.assign(absolute, { alpha: 90 });
      window.dispatchEvent(absolute);
      // The plain event's alpha is relative to an arbitrary start on these
      // browsers and must not be mixed in.
      window.dispatchEvent(orientationEvent({ alpha: 180 }));
      expect(headings).toEqual([270]);
      stop();
    } finally {
      delete (window as unknown as { ondeviceorientationabsolute?: null })
        .ondeviceorientationabsolute;
    }
  });

  it('grants permission without a prompt where the browser has none', async () => {
    vi.stubGlobal('DeviceOrientationEvent', class {});
    await expect(createWebHeading().requestPermission()).resolves.toBe(true);
  });

  it('asks iOS for permission and reports denial', async () => {
    const requestPermission = vi.fn().mockResolvedValue('denied');
    vi.stubGlobal(
      'DeviceOrientationEvent',
      class {
        static requestPermission = requestPermission;
      },
    );
    await expect(createWebHeading().requestPermission()).resolves.toBe(false);
    requestPermission.mockResolvedValue('granted');
    await expect(createWebHeading().requestPermission()).resolves.toBe(true);
    requestPermission.mockRejectedValue(new Error('not from a gesture'));
    await expect(createWebHeading().requestPermission()).resolves.toBe(false);
  });
});

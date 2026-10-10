/** @vitest-environment jsdom */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { PlatformProvider } from '@/platform/context';
import type { PlatformServices } from '@/platform/types';
import { useKeepAwake } from './useKeepAwake';

function fakePlatform() {
  const release = vi.fn();
  const acquire = vi.fn(() => release);
  const services = {
    kind: 'native',
    keepAwake: { isSupported: () => true, acquire },
  } as unknown as PlatformServices;
  return { services, acquire, release };
}

describe('useKeepAwake', () => {
  it('acquires the platform lock while active and releases it after', () => {
    const { services, acquire, release } = fakePlatform();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <PlatformProvider services={services}>{children}</PlatformProvider>
    );
    const { rerender, unmount } = renderHook(
      ({ active }: { active: boolean }) => useKeepAwake(active),
      { wrapper, initialProps: { active: false } },
    );
    expect(acquire).not.toHaveBeenCalled();

    rerender({ active: true });
    expect(acquire).toHaveBeenCalledTimes(1);
    expect(release).not.toHaveBeenCalled();

    rerender({ active: false });
    expect(release).toHaveBeenCalledTimes(1);

    rerender({ active: true });
    unmount();
    expect(release).toHaveBeenCalledTimes(2);
  });
});

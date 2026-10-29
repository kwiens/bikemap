'use client';

import { useEffect } from 'react';
import { usePlatform } from '@/platform/context';

/** Hold the screen awake while `active` is true. */
export function useKeepAwake(active: boolean): void {
  const { keepAwake } = usePlatform();
  useEffect(() => {
    if (!active) return;
    return keepAwake.acquire();
  }, [active, keepAwake]);
}

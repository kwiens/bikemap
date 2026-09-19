import { act } from '@testing-library/react';

export function dispatch(
  event: string,
  detail?: Record<string, unknown>,
): void {
  act(() => {
    window.dispatchEvent(new CustomEvent(event, { detail }));
  });
}

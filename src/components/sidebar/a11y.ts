import type { KeyboardEvent } from 'react';

// Props for making a non-button element behave like an accessible button:
// click + Enter/Space activation, button role, and keyboard focusability.
// Spread onto the element: <div {...pressableProps(handleClick)} />
export function pressableProps(onActivate: () => void) {
  return {
    onClick: onActivate,
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onActivate();
      }
    },
    role: 'button' as const,
    tabIndex: 0,
  };
}

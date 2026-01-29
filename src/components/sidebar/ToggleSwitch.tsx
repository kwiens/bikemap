import type { ToggleSwitchProps } from './types';

export function ToggleSwitch({ isActive }: ToggleSwitchProps) {
  return (
    <div
      className={`toggle-switch ${isActive ? 'toggle-switch-active' : 'toggle-switch-inactive'}`}
    >
      <div
        className={`toggle-switch-handle ${isActive ? 'toggle-switch-handle-active' : 'toggle-switch-handle-inactive'}`}
      />
    </div>
  );
}

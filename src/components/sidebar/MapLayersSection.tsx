import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { IconDefinition } from '@fortawesome/free-solid-svg-icons';
import type { ReactNode } from 'react';
import { ToggleSwitch } from './ToggleSwitch';

// Shared "Map Layers" sidebar section used by both the Casual and MTB tabs.
export function MapLayersSection({ children }: { children: ReactNode }) {
  return (
    <div className="mb-6">
      <h3 className="text-sm font-medium mb-2 text-gray-600">Map Layers</h3>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}

interface ToggleRowProps {
  icon: IconDefinition;
  label: string;
  isActive: boolean;
  onToggle: () => void;
}

// A single labeled toggle row (icon + label + switch) with keyboard support.
export function ToggleRow({ icon, label, isActive, onToggle }: ToggleRowProps) {
  return (
    <div
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onToggle();
        }
      }}
      role="button"
      tabIndex={0}
      className="p-2 rounded cursor-pointer transition-all duration-200 flex items-center justify-between hover:bg-blue-600/5"
    >
      <div className="flex items-center gap-3">
        <FontAwesomeIcon icon={icon} className="w-4 h-4 text-gray-500" />
        <span className="font-medium">{label}</span>
      </div>
      <ToggleSwitch isActive={isActive} />
    </div>
  );
}

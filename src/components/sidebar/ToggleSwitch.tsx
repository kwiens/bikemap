import { cn } from '@/lib/utils';
import type { ToggleSwitchProps } from './types';

export function ToggleSwitch({ isActive }: ToggleSwitchProps) {
  return (
    <div
      className={cn(
        'w-10 h-5 rounded-full relative transition-colors duration-200',
        isActive ? 'bg-blue-500' : 'bg-gray-300',
      )}
    >
      <div
        className={cn(
          'absolute top-0.5 w-4 h-4 bg-white rounded-full transition-[left] duration-200',
          isActive ? 'left-[22px]' : 'left-0.5',
        )}
      />
    </div>
  );
}

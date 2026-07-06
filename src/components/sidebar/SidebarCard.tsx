import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faLocationArrow,
  type IconDefinition,
} from '@fortawesome/free-solid-svg-icons';
import { cn } from '@/lib/utils';

type ColorTheme = 'blue' | 'green' | 'purple' | 'gray';

const colorConfig = {
  blue: {
    iconContainer: 'bg-blue-50 border-2 border-blue-500',
    icon: 'text-blue-500',
    cardHover: 'hover:bg-blue-600/5 hover:border-blue-600/30 hover:shadow-md',
    arrow: 'bg-blue-50 text-blue-500',
  },
  green: {
    iconContainer: 'bg-emerald-50 border-2 border-emerald-400',
    icon: 'text-emerald-400',
    cardHover:
      'hover:bg-emerald-400/5 hover:border-emerald-400/30 hover:shadow-md',
    arrow: 'bg-emerald-50 text-emerald-400',
  },
  purple: {
    iconContainer: 'bg-violet-100 border-2 border-violet-500',
    icon: 'text-violet-500',
    cardHover:
      'hover:bg-violet-500/5 hover:border-violet-500/30 hover:shadow-md',
    arrow: 'bg-violet-100 text-violet-500',
  },
  gray: {
    iconContainer: 'bg-gray-100 border-2 border-gray-500',
    icon: 'text-gray-500',
    cardHover: 'hover:bg-gray-500/5 hover:border-gray-500/30 hover:shadow-md',
    arrow: 'bg-gray-100 text-gray-500',
  },
} as const;

interface SidebarCardProps {
  colorTheme: ColorTheme;
  icon: IconDefinition;
  title: string;
  description: React.ReactNode;
  onClick?: () => void;
  showArrow?: boolean;
  children?: React.ReactNode;
}

export function SidebarCard({
  colorTheme,
  icon,
  title,
  description,
  onClick,
  showArrow = false,
  children,
}: SidebarCardProps) {
  const colors = colorConfig[colorTheme];

  return (
    <div
      className={cn(
        'px-2 pt-2 pb-1.5 rounded-md transition-all duration-200 border border-transparent shadow-sm cursor-pointer',
        colors.cardHover,
      )}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.();
        }
      }}
      role="button"
      tabIndex={0}
    >
      <div className="flex items-center gap-3">
        <div
          className={cn(
            'w-7 h-7 rounded-full flex items-center justify-center shrink-0',
            colors.iconContainer,
          )}
        >
          <FontAwesomeIcon
            icon={icon}
            className={cn('w-3.5 h-3.5', colors.icon)}
          />
        </div>
        <span className="font-medium">{title}</span>
      </div>
      <div
        className={cn(
          'text-xs text-gray-500 mt-1 ml-10',
          showArrow && 'flex justify-between items-center',
        )}
      >
        {showArrow ? (
          <span className="flex-1">{description}</span>
        ) : (
          description
        )}
        {showArrow && (
          <div
            className={cn(
              'flex items-center justify-center p-1.5 rounded ml-2',
              colors.arrow,
            )}
          >
            <FontAwesomeIcon icon={faLocationArrow} className="w-3.5 h-3.5" />
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

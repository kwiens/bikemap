import { siteConfig } from '@/config/site.config';
import { cn } from '@/lib/utils';

const hasLightMapChrome = siteConfig.cityId === 'chattanooga';

// Touch browsers can retain :hover after a tap, so restrict hover colors to
// devices whose primary pointer supports precise hovering.
export const TOGGLE_BTN_CLASS = cn(
  'rounded-full p-3 shadow-md cursor-pointer flex items-center justify-center',
  hasLightMapChrome
    ? 'bg-app-surface border-none [@media(hover:hover)_and_(pointer:fine)]:hover:bg-gray-50'
    : 'bg-app-secondary border border-app-primary/40 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-app-accent [@media(hover:hover)_and_(pointer:fine)]:[&_svg]:hover:text-app-secondary',
);

export const TOGGLE_ICON_CLASS = cn(
  'w-5 h-5',
  hasLightMapChrome ? 'text-app-ink' : 'text-app-primary',
);

export const SIDEBAR_THEME_CLASS = cn(
  'fixed top-0 left-0 h-full w-[280px] z-950 overflow-hidden transition-transform duration-300 ease-in-out flex flex-col max-md:w-full max-md:max-w-[320px]',
  hasLightMapChrome
    ? 'bg-app-surface text-app-ink shadow-[2px_0_5px_rgba(0,0,0,0.1)]'
    : 'bg-app-secondary text-app-surface shadow-[2px_0_16px_rgba(26,67,78,0.18)] [&_.bg-white]:!bg-transparent [&_.bg-gray-50]:!bg-app-surface/5 [&_.bg-gray-100]:!bg-app-surface/10 [&_.bg-gray-200]:!bg-app-surface/15 [&_.text-gray-900]:!text-app-surface [&_.text-gray-800]:!text-app-surface [&_.text-gray-700]:!text-app-surface/90 [&_.text-gray-600]:!text-app-surface/80 [&_.text-gray-500]:!text-app-surface/70 [&_.text-gray-400]:!text-app-surface/55 [&_.border-gray-200]:!border-app-surface/20 [&_.border-gray-300]:!border-app-surface/30',
);

export const SIDEBAR_COLORS = hasLightMapChrome
  ? {
      header: 'border-gray-200 bg-gray-50',
      label: 'text-gray-700',
      tabList: 'border-gray-200 bg-gray-100',
      selectedTab: 'bg-app-surface text-gray-800 shadow-xs',
      unselectedTab: 'text-gray-600 hover:text-gray-700',
      contentBorder: '',
    }
  : {
      header: 'border-app-primary/40 bg-app-secondary',
      label: 'text-app-surface',
      tabList: 'border-app-surface/20 bg-app-surface/10',
      selectedTab: 'bg-app-primary text-app-secondary shadow-xs',
      unselectedTab: 'text-app-surface/70 hover:text-app-surface',
      contentBorder: 'border-t border-app-surface/10',
    };

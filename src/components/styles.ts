/** Shared Tailwind class strings for components that appear in multiple files */

export const TOGGLE_BTN_CLASS =
  'bg-app-secondary rounded-full p-3 shadow-md cursor-pointer flex items-center justify-center border border-app-primary/40 transition-colors duration-150 hover:bg-app-accent active:bg-app-secondary';

export const TOGGLE_ICON_CLASS = 'w-5 h-5 text-app-primary';

/** One continuous dark sidebar while preserving hierarchy in legacy neutrals. */
export const SIDEBAR_THEME_CLASS =
  'fixed top-0 left-0 h-full w-[280px] bg-app-secondary text-app-surface shadow-[2px_0_16px_rgba(26,67,78,0.18)] z-[950] overflow-hidden transition-transform duration-300 ease-in-out flex flex-col max-md:w-full max-md:max-w-[320px] [&_.bg-white]:!bg-transparent [&_.bg-gray-50]:!bg-app-surface/5 [&_.bg-gray-100]:!bg-app-surface/10 [&_.bg-gray-200]:!bg-app-surface/15 [&_.text-gray-900]:!text-app-surface [&_.text-gray-800]:!text-app-surface [&_.text-gray-700]:!text-app-surface/90 [&_.text-gray-600]:!text-app-surface/80 [&_.text-gray-500]:!text-app-surface/70 [&_.text-gray-400]:!text-app-surface/55 [&_.border-gray-200]:!border-app-surface/20 [&_.border-gray-300]:!border-app-surface/30';

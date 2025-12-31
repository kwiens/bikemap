'use client';

import React from 'react';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

function isIosDevice(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  const userAgent = window.navigator.userAgent.toLowerCase();
  return /iphone|ipad|ipod/.test(userAgent);
}

function isStandaloneMode(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Boolean((window.navigator as any).standalone)
  );
}

function getDismissedFlag(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  return window.localStorage.getItem('pwa-install-dismissed') === 'true';
}

function setDismissedFlag(): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem('pwa-install-dismissed', 'true');
}

export function PwaInstallPrompt(): React.ReactElement | null {
  const deferredPrompt = React.useRef<BeforeInstallPromptEvent | null>(null);
  const [isVisible, setIsVisible] = React.useState(false);
  const [isIos, setIsIos] = React.useState(false);

  React.useEffect(() => {
    if (getDismissedFlag() || isStandaloneMode()) {
      return;
    }

    const ios = isIosDevice();
    setIsIos(ios);

    if (ios) {
      setIsVisible(true);
      return;
    }

    const handleBeforeInstall = (event: Event) => {
      event.preventDefault();
      deferredPrompt.current = event as BeforeInstallPromptEvent;
      setIsVisible(true);
    };

    const handleAppInstalled = () => {
      deferredPrompt.current = null;
      setIsVisible(false);
      setDismissedFlag();
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    const promptEvent = deferredPrompt.current;
    if (!promptEvent) {
      return;
    }
    await promptEvent.prompt();
    await promptEvent.userChoice;
    deferredPrompt.current = null;
    setIsVisible(false);
    setDismissedFlag();
  };

  const handleDismiss = () => {
    setIsVisible(false);
    setDismissedFlag();
  };

  if (!isVisible) {
    return null;
  }

  return (
    <div className="fixed bottom-4 left-4 right-4 z-[2000] sm:hidden">
      <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-white/95 p-4 shadow-lg backdrop-blur">
        <div className="flex-1">
          <p className="text-sm font-semibold text-emerald-900">
            Add Bike Chatt to your home screen
          </p>
          <p className="text-xs text-emerald-700">
            {isIos
              ? 'Tap the Share icon, then “Add to Home Screen.”'
              : 'Install for quick access.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!isIos && (
            <button
              className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white"
              onClick={handleInstallClick}
              type="button"
            >
              Install
            </button>
          )}
          <button
            className="rounded-full border border-emerald-200 px-2 py-1 text-xs text-emerald-700"
            onClick={handleDismiss}
            type="button"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}

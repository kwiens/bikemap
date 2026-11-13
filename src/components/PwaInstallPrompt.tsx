'use client';

import React from 'react';
import { siteConfig } from '@/config/site.config';
import { isInsideNativeShell } from '@/platform/native/transport';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

function isIosDevice(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  const userAgent = window.navigator.userAgent.toLowerCase();
  return (
    /iphone|ipad|ipod/.test(userAgent) ||
    (userAgent.includes('macintosh') && window.navigator.maxTouchPoints > 1)
  );
}

function isStandaloneMode(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone ===
      true
  );
}

function getDismissedFlag(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  try {
    return window.localStorage.getItem('pwa-install-dismissed') === 'true';
  } catch {
    return false;
  }
}

function setDismissedFlag(): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem('pwa-install-dismissed', 'true');
  } catch {
    // The prompt can still be dismissed for this page when storage is blocked.
  }
}

export function PwaInstallPrompt(): React.ReactElement | null {
  // Inside the native shell the app is already installed — whatever protocol
  // version the shell speaks, so this is presence, not `usePlatform().kind`.
  const isNativeShell = isInsideNativeShell();
  const deferredPrompt = React.useRef<BeforeInstallPromptEvent | null>(null);
  const [isVisible, setIsVisible] = React.useState(false);
  const [isIos, setIsIos] = React.useState(false);
  const [isInstalling, setIsInstalling] = React.useState(false);

  React.useEffect(() => {
    if (isNativeShell || getDismissedFlag() || isStandaloneMode()) {
      setIsVisible(false);
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
  }, [isNativeShell]);

  const handleInstallClick = async () => {
    const promptEvent = deferredPrompt.current;
    if (!promptEvent) {
      return;
    }
    deferredPrompt.current = null;
    setIsInstalling(true);
    try {
      await promptEvent.prompt();
      await promptEvent.userChoice;
      setDismissedFlag();
    } catch {
      // The browser can invalidate this single-use prompt before the tap.
    } finally {
      setIsInstalling(false);
      setIsVisible(false);
    }
  };

  const handleDismiss = () => {
    deferredPrompt.current = null;
    setIsVisible(false);
    setDismissedFlag();
  };

  if (!isVisible) {
    return null;
  }

  return (
    <div className="fixed bottom-4 left-4 right-4 z-2000 sm:hidden">
      <div className="flex flex-col gap-3 rounded-2xl border border-emerald-200 bg-white/95 p-4 shadow-lg backdrop-blur-sm">
        <div>
          <p className="text-sm font-semibold text-emerald-900">
            Add {siteConfig.name} to your home screen
          </p>
          <p className="text-xs text-emerald-700">
            {isIos
              ? 'Tap the Share icon, then “Add to Home Screen.”'
              : 'Install for quick access.'}
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {!isIos && (
            <button
              className="min-h-12 min-w-12 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"
              onClick={handleInstallClick}
              disabled={isInstalling}
              type="button"
            >
              Install
            </button>
          )}
          <button
            className="min-h-12 min-w-12 rounded-full border border-emerald-200 px-4 py-2 text-sm text-emerald-700"
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

import { useState, useEffect, useCallback } from 'react';

interface UseToastReturn {
  message: string | null;
  isFadingOut: boolean;
  showToast: (message: string) => void;
}

export function useToast(duration = 3000): UseToastReturn {
  const [message, setMessage] = useState<string | null>(null);
  const [isFadingOut, setIsFadingOut] = useState(false);
  // Bumped on every showToast so re-showing an identical message restarts the
  // timers (a plain message dep would see no change and do nothing).
  const [showCount, setShowCount] = useState(0);

  const showToast = useCallback((newMessage: string) => {
    setMessage(newMessage);
    setIsFadingOut(false);
    setShowCount((n) => n + 1);
  }, []);

  // Both timers are scheduled together from the show event and must not depend
  // on isFadingOut: re-running the effect when the fade-out state flips would
  // cancel the pending removal and leave the toast mounted forever.
  useEffect(() => {
    if (message === null) return;

    // Start fade-out animation 300ms before removal
    const fadeOutTimer = setTimeout(() => {
      setIsFadingOut(true);
    }, duration - 300);

    // Remove the toast after duration
    const removeTimer = setTimeout(() => {
      setMessage(null);
      setIsFadingOut(false);
    }, duration);

    return () => {
      clearTimeout(fadeOutTimer);
      clearTimeout(removeTimer);
    };
  }, [message, showCount, duration]);

  return { message, isFadingOut, showToast };
}

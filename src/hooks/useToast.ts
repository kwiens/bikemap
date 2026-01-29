import { useState, useEffect, useCallback } from 'react';

interface UseToastReturn {
  message: string | null;
  isFadingOut: boolean;
  showToast: (message: string) => void;
}

export function useToast(duration = 3000): UseToastReturn {
  const [message, setMessage] = useState<string | null>(null);
  const [isFadingOut, setIsFadingOut] = useState(false);

  const showToast = useCallback((newMessage: string) => {
    setMessage(newMessage);
    setIsFadingOut(false);
  }, []);

  useEffect(() => {
    if (message && !isFadingOut) {
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
    }
  }, [message, isFadingOut, duration]);

  return { message, isFadingOut, showToast };
}

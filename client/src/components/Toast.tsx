import React, { useEffect, useState } from 'react';
import { Check } from 'lucide-react';

const TOAST_EVENT = 'grokbot:toast';
const VISIBLE_MS = 2200;

export function showToast(message: string): void {
  window.dispatchEvent(new CustomEvent<string>(TOAST_EVENT, { detail: message }));
}

export const ToastHost: React.FC = () => {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let timer: number | undefined;
    const handler = (event: Event) => {
      setMessage((event as CustomEvent<string>).detail);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setMessage(null), VISIBLE_MS);
    };
    window.addEventListener(TOAST_EVENT, handler);
    return () => {
      window.removeEventListener(TOAST_EVENT, handler);
      window.clearTimeout(timer);
    };
  }, []);

  if (!message) return null;

  return (
    <div className="toast" role="status" aria-live="polite">
      <Check size={15} />
      {message}
    </div>
  );
};

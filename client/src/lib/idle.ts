import { useEffect } from 'react';
import { navigate } from './router';

/** Long enough that reading a page never trips it. */
const IDLE_MS = 90_000;

const ACTIVITY = ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart'] as const;

/**
 * Drops into display mode when the showcase has been sitting untouched, so a
 * laptop left on a table turns itself into the room's screen. Only ever runs on
 * the showcase itself — never while someone is part-way through a form.
 *
 * The `idle` flag tells display mode it arrived by itself, which is what lets a
 * single mouse movement dismiss it like any other screensaver.
 */
export function useIdleDisplay(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    let timer = 0;
    const arm = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => navigate('/display?idle=1'), IDLE_MS);
    };

    arm();
    ACTIVITY.forEach((event) => window.addEventListener(event, arm, { passive: true }));
    return () => {
      window.clearTimeout(timer);
      ACTIVITY.forEach((event) => window.removeEventListener(event, arm));
    };
  }, [active]);
}

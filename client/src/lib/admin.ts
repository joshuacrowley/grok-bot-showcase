import { useEffect, useState } from 'react';

const KEY = 'grok-bot-showcase:curator';
const CHANGED = 'grokbot:curator-changed';

/**
 * Whether curator controls are showing. Only a flag is kept, not the password —
 * the password is checked once by the Worker and never stored.
 *
 * This is a gate on the buttons, not a permission boundary. Every browser holds
 * a writeable copy of the synced store, so anyone determined enough can delete
 * rows from a console regardless. It exists to keep destructive controls out of
 * the way, and to make the person clicking them mean it.
 */
function read(): boolean {
  try {
    return localStorage.getItem(KEY) === 'on';
  } catch {
    return false;
  }
}

function write(curating: boolean): void {
  try {
    if (curating) localStorage.setItem(KEY, 'on');
    else localStorage.removeItem(KEY);
  } catch {
    // Storage unavailable: curating lasts only as long as this page.
  }
  window.dispatchEvent(new Event(CHANGED));
}

export function isCurating(): boolean {
  return read();
}

export async function unlock(password: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const response = await fetch('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    return { ok: false, error: body.error ?? `Could not sign in (${response.status})` };
  }

  write(true);
  return { ok: true };
}

export function lock(): void {
  write(false);
}

/** Re-renders on unlock, lock, and changes made in another tab. */
export function useCurating(): boolean {
  const [curating, setCurating] = useState(isCurating);

  useEffect(() => {
    const sync = () => setCurating(isCurating());
    window.addEventListener(CHANGED, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(CHANGED, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  return curating;
}

const OPEN_GATE = 'grokbot:open-curator-gate';

export function openCuratorGate(): void {
  window.dispatchEvent(new Event(OPEN_GATE));
}

export function onOpenCuratorGate(handler: () => void): () => void {
  window.addEventListener(OPEN_GATE, handler);
  return () => window.removeEventListener(OPEN_GATE, handler);
}

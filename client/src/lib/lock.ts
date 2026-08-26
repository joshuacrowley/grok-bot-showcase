import { useEffect, useState } from 'react';

/**
 * Whether the showcase is frozen. The Worker holds the flag and the sync server
 * drops incoming changes while it is set, so this is not the thing enforcing it —
 * it is how the UI stops offering people writes that would be discarded.
 */
const POLL_MS = 30_000;

let locked = false;
let known = false;
const listeners = new Set<(locked: boolean) => void>();
let timer = 0;

function publish(next: boolean): void {
  const changed = next !== locked || !known;
  locked = next;
  known = true;
  if (changed) listeners.forEach((listener) => listener(next));
}

export async function refreshLock(): Promise<boolean> {
  try {
    const response = await fetch('/api/lock', { cache: 'no-store' });
    if (response.ok) {
      const body = (await response.json()) as { locked?: unknown };
      publish(body.locked === true);
    }
  } catch {
    // Offline: keep the last answer rather than guessing.
  }
  return locked;
}

function start(): void {
  if (timer) return;
  void refreshLock();
  timer = window.setInterval(refreshLock, POLL_MS);
  // A tab left open overnight should notice the freeze when it wakes up.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void refreshLock();
  });
}

export function useLocked(): boolean {
  const [state, setState] = useState(locked);
  useEffect(() => {
    start();
    setState(locked);
    listeners.add(setState);
    return () => {
      listeners.delete(setState);
    };
  }, []);
  return state;
}

export async function setLocked(
  password: string,
  next: boolean,
): Promise<{ ok: true; locked: boolean } | { ok: false; error: string }> {
  const response = await fetch('/api/lock', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password, locked: next }),
  });

  const body = (await response.json().catch(() => ({}))) as {
    locked?: unknown;
    error?: string;
  };
  if (!response.ok) {
    return { ok: false, error: body.error ?? `Could not change the lock (${response.status})` };
  }

  publish(body.locked === true);
  return { ok: true, locked: body.locked === true };
}

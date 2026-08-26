import { useEffect, useMemo, useState } from 'react';
import { useTables } from 'tinybase/ui-react';
import { type Bot, type BotDetail, getBot, listBots, store } from './store';

/**
 * Whether this browser is talking to the sync server. The store still works
 * while offline — writes queue in the local persister and merge on reconnect —
 * so this is for telling the user, not for gating anything.
 */
export type SyncState = 'connecting' | 'live' | 'offline';

let syncState: SyncState = 'connecting';
const syncListeners = new Set<(state: SyncState) => void>();

export function setSyncState(next: SyncState): void {
  if (syncState === next) return;
  syncState = next;
  syncListeners.forEach((listener) => listener(next));
}

export function useSyncState(): SyncState {
  const [state, setState] = useState(syncState);
  useEffect(() => {
    setState(syncState);
    syncListeners.add(setState);
    return () => {
      syncListeners.delete(setState);
    };
  }, []);
  return state;
}

/**
 * Every bot in the showcase, re-rendering whenever anything changes anywhere —
 * including in someone else's browser.
 */
export function useBots(): { bots: Bot[]; loading: boolean } {
  const tables = useTables(store);
  const state = useSyncState();
  // `tables` is a new object on every change, which is exactly the signal here.
  const bots = useMemo(() => listBots(), [tables]);
  return { bots, loading: state === 'connecting' && bots.length === 0 };
}

export function useBot(id: string): { bot: BotDetail | null; loading: boolean } {
  const tables = useTables(store);
  const state = useSyncState();
  const bot = useMemo(() => getBot(id), [tables, id]);
  return { bot, loading: state === 'connecting' && bot === null };
}

import { createMergeableStore, type Id, type IdAddedOrRemoved } from 'tinybase';
import { createDurableObjectSqlStoragePersister } from 'tinybase/persisters/persister-durable-object-sql-storage';
import {
  WsServerDurableObject,
  getWsServerDurableObjectFetch,
} from 'tinybase/synchronizers/synchronizer-ws-server-durable-object';

interface Env {
  ASSETS: Fetcher;
  ShowcaseSync: DurableObjectNamespace<WsServerDurableObject<unknown>>;
  /**
   * Set with `wrangler secret put ADMIN_PASSWORD`. Gates locking and the curator
   * controls. While it is unset those routes refuse.
   */
  ADMIN_PASSWORD?: string;
}

/**
 * The client connects to /api/sync, and TinyBase derives the Durable Object from
 * that path. The Worker needs the same id to read and set the lock on the object
 * that is actually serving the sockets.
 */
const SYNC_PATH = '/api/sync';
const SYNC_PATH_ID = 'api/sync';

const LOCK_KEY = 'showcase:locked';

/**
 * TinyBase sync message types, from the wire protocol. A client pulls with
 * GetContentHashes and the three Get*Diff messages; everything else carries data
 * away from the client and into the shared store.
 */
const PULL_MESSAGES = new Set([
  1, // GetContentHashes
  4, // GetTableDiff
  5, // GetRowDiff
  6, // GetCellDiff
  7, // GetValueDiff
]);

export class ShowcaseSync extends WsServerDurableObject<Env> {
  /** Mirrored in memory because webSocketMessage cannot await storage. */
  #locked = false;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.#locked = (await ctx.storage.get<boolean>(LOCK_KEY)) === true;
    });
  }

  onPathId(pathId: Id, addedOrRemoved: IdAddedOrRemoved) {
    console.info(`${addedOrRemoved ? 'Added' : 'Removed'} path ${pathId}`);
  }

  onClientId(pathId: Id, clientId: Id, addedOrRemoved: IdAddedOrRemoved) {
    console.info(
      `${addedOrRemoved ? 'Added' : 'Removed'} client ${clientId} on path ${pathId}`,
    );
  }

  createPersister() {
    return createDurableObjectSqlStoragePersister(
      createMergeableStore(),
      this.ctx.storage.sql,
    );
  }

  /**
   * While locked, only the messages a client uses to read are passed through to
   * TinyBase. Anything that would carry a client's own content into the shared
   * store is dropped, so the showcase becomes a genuinely read-only archive
   * rather than one that merely hides its buttons.
   */
  override webSocketMessage(client: WebSocket, message: string | ArrayBuffer): void {
    if (this.#locked && !isPullMessage(message)) return;
    // Optional on the DurableObject base class, always present on this one.
    super.webSocketMessage?.(client, message);
  }

  isLocked(): boolean {
    return this.#locked;
  }

  async setLocked(locked: boolean): Promise<boolean> {
    this.#locked = locked;
    await this.ctx.storage.put(LOCK_KEY, locked);
    return locked;
  }
}

/**
 * Reads the message type out of a `toClientId\n[requestId, type, body]` payload.
 * An unreadable payload counts as a write, so a locked showcase fails closed.
 */
function isPullMessage(message: string | ArrayBuffer): boolean {
  const text = message.toString();
  const separator = text.indexOf('\n');
  if (separator === -1) return false;
  try {
    const parsed = JSON.parse(text.slice(separator + 1)) as unknown;
    return Array.isArray(parsed) && PULL_MESSAGES.has(parsed[1] as number);
  } catch {
    return false;
  }
}

const syncFetch = getWsServerDurableObjectFetch('ShowcaseSync');

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Cache-Control': 'no-store',
    },
  });
}

async function sha256(value: string): Promise<Uint8Array> {
  return new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
  );
}

/**
 * Compares digests rather than the strings themselves, so the work does not
 * depend on how much of the password was guessed correctly.
 */
async function secretsMatch(a: string, b: string): Promise<boolean> {
  const [left, right] = await Promise.all([sha256(a), sha256(b)]);
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left[index] ^ right[index];
  }
  return diff === 0;
}

async function checkPassword(
  request: Request,
  env: Env,
): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; response: Response }> {
  if (!env.ADMIN_PASSWORD) {
    return {
      ok: false,
      response: json(
        { error: 'Curating is not set up on this deployment. No ADMIN_PASSWORD secret is set.' },
        503,
      ),
    };
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    // Falls through to the rejection below.
  }

  const supplied = typeof body.password === 'string' ? body.password : '';
  if (!supplied || !(await secretsMatch(supplied, env.ADMIN_PASSWORD))) {
    return { ok: false, response: json({ error: 'Wrong password.' }, 401) };
  }
  return { ok: true, body };
}

function showcase(env: Env) {
  return env.ShowcaseSync.get(env.ShowcaseSync.idFromName(SYNC_PATH_ID)) as unknown as ShowcaseSync;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
      return syncFetch(request, env);
    }

    if (request.method === 'OPTIONS') {
      return json({ ok: true });
    }

    if (url.pathname === '/api/lock') {
      if (request.method === 'GET') {
        return json({ locked: await showcase(env).isLocked() });
      }
      if (request.method === 'POST') {
        const check = await checkPassword(request, env);
        if (!check.ok) return check.response;
        const locked = check.body.locked !== false;
        return json({ locked: await showcase(env).setLocked(locked) });
      }
    }

    if (url.pathname === '/api/admin/login' && request.method === 'POST') {
      const check = await checkPassword(request, env);
      if (!check.ok) return check.response;
      return json({ ok: true });
    }

    if (url.pathname === '/api/health') {
      return json({
        ok: true,
        locked: await showcase(env).isLocked(),
        curating: env.ADMIN_PASSWORD ? 'configured' : 'unset',
        syncPath: SYNC_PATH,
      });
    }

    if (url.pathname.startsWith('/api/')) {
      return json({ error: `No API route for ${request.method} ${url.pathname}` }, 404);
    }

    return env.ASSETS.fetch(request);
  },
};

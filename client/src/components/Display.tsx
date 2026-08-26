import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUp, MessageCircleQuestion, Sparkles, X } from 'lucide-react';
import { type Bot } from '../lib/store';
import { useBots, useSyncState } from '../lib/showcase';
import { navigate } from '../lib/router';
import { BotAvatar } from './BotAvatar';

/**
 * Display mode: the showcase as something to leave running on a screen while
 * people are still adding bots. Everything drifts, the camera pans, and because
 * the store is synced, a bot added on someone's laptop pops into the middle of
 * the room a second later.
 */

/**
 * The field is sized to the screen rather than to a larger world that the camera
 * tours. At an event with a dozen bots, a bot that has drifted out of frame is a
 * bot nobody can see or click, so everything stays inside the viewport and the
 * pan is a gentle sway on top of that.
 */
const PAN_PERIOD_X_MS = 47_000;
const PAN_PERIOD_Y_MS = 61_000;
const PAN_AMPLITUDE = 0.022;
const DRIFT_MIN = 5;
const DRIFT_MAX = 13;
/** Room for the exit button up top and the ticker along the bottom. */
const MARGIN_X = 96;
const MARGIN_TOP = 86;
const MARGIN_BOTTOM = 124;
/** Keeps a crowd from stacking into one pile. */
const SEPARATION_GAP = 26;
const SEPARATION_PUSH = 5;
/** How long a new arrival wears its ring. */
const NEW_MS = 8_000;
/** A birth time far enough in the past that a bot never reads as new. */
const ALREADY_HERE = Number.NEGATIVE_INFINITY;
/** Golden angle, for scattering bots evenly instead of in hash-driven clumps. */
const GOLDEN_ANGLE = 2.399963;
const POP_MS = 900;
/** A focused bot returns to the field on its own, so a display never gets stuck. */
const FOCUS_AUTO_RETURN_MS = 24_000;
const TICKER_MAX = 3;
const TICKER_KEEP_MS = 45_000;

interface Node {
  bot: Bot;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  born: number;
  el: HTMLDivElement | null;
}

interface Event {
  key: string;
  kind: 'joined' | 'upvote' | 'question';
  bot: Bot;
  at: number;
}

function hash01(value: string, salt: number): number {
  let h = (2166136261 ^ salt) >>> 0;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100_000) / 100_000;
}

/**
 * Upvotes earn a little size, so the room's favourites read from across it. The
 * base scales with the screen, since this is meant to be legible from a couch.
 */
function sizeFor(bot: Bot, vw: number, vh: number): number {
  const base = Math.max(56, Math.min(Math.min(vw, vh) * 0.082, 116));
  return base + Math.min(bot.upvotes, 12) * 3.4;
}

/**
 * Phyllotaxis: an even, organic-looking spread for any number of bots. Seeding
 * positions from the id alone left big empty patches and tight clumps.
 */
function scatter(index: number, count: number, bounds: Bounds, jitter: number): [number, number] {
  const radius = Math.sqrt((index + 0.5) / Math.max(count, 1));
  const angle = index * GOLDEN_ANGLE;
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  const spanX = (bounds.maxX - bounds.minX) / 2;
  const spanY = (bounds.maxY - bounds.minY) / 2;
  return [
    cx + Math.cos(angle) * radius * spanX * (0.9 + jitter * 0.12),
    cy + Math.sin(angle) * radius * spanY * (0.9 + jitter * 0.12),
  ];
}

/** Footprint, including the name sitting under the avatar. */
function radiusFor(size: number): number {
  return size / 2 + 10;
}

interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/** The rectangle of world space that is guaranteed to be on screen. */
function boundsFor(vw: number, vh: number): Bounds {
  const swayX = vw * PAN_AMPLITUDE;
  const swayY = vh * PAN_AMPLITUDE;
  return {
    minX: -(vw / 2) + MARGIN_X + swayX,
    maxX: vw / 2 - MARGIN_X - swayX,
    minY: -(vh / 2) + MARGIN_TOP + swayY,
    maxY: vh / 2 - MARGIN_BOTTOM - swayY,
  };
}

function easeOutBack(t: number): number {
  const c = 1.70158;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
}

function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

export const Display: React.FC = () => {
  const { bots } = useBots();
  const syncState = useSyncState();
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [, forceRender] = useState(0);

  const nodesRef = useRef<Map<string, Node>>(new Map());
  const laidOutRef = useRef(false);
  const camRef = useRef({ x: 0, y: 0 });
  const dragRef = useRef<{ id: string; lastX: number; lastY: number; moved: number } | null>(null);
  const seenRef = useRef<Map<string, Bot> | null>(null);
  const focusedIdRef = useRef<string | null>(null);
  focusedIdRef.current = focusedId;

  const byId = useMemo(() => new Map(bots.map((bot) => [bot.id, bot])), [bots]);
  const focused = focusedId ? (byId.get(focusedId) ?? null) : null;

  const totals = useMemo(
    () => ({
      bots: bots.length,
      upvotes: bots.reduce((sum, bot) => sum + bot.upvotes, 0),
      questions: bots.reduce((sum, bot) => sum + bot.questionCount, 0),
    }),
    [bots],
  );

  // Keep one node per bot. New arrivals land in the middle of the view, which is
  // the whole point of leaving this on a screen during the event.
  useEffect(() => {
    const nodes = nodesRef.current;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const bounds = boundsFor(vw, vh);
    const first = !laidOutRef.current;
    let changed = false;

    bots.forEach((bot, index) => {
      const existing = nodes.get(bot.id);
      if (existing) {
        existing.bot = bot;
        existing.size = sizeFor(bot, vw, vh);
        return;
      }

      const angle = hash01(bot.id, 3) * Math.PI * 2;
      const speed = DRIFT_MIN + hash01(bot.id, 4) * (DRIFT_MAX - DRIFT_MIN);
      // Spread evenly on first paint; anything arriving later lands in the
      // middle, where people are already looking.
      const [x, y] = first
        ? scatter(index, bots.length, bounds, hash01(bot.id, 1))
        : [0, 0];
      nodes.set(bot.id, {
        bot,
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: sizeFor(bot, vw, vh),
        // The opening batch is simply there; only later arrivals announce
        // themselves with a pop and a ring. Zero would not do: performance.now()
        // is still small moments after load, so the whole field would look new.
        born: first ? ALREADY_HERE : performance.now(),
        el: null,
      });
      changed = true;
    });

    for (const id of [...nodes.keys()]) {
      if (!byId.has(id)) {
        nodes.delete(id);
        changed = true;
      }
    }

    if (bots.length > 0) laidOutRef.current = true;
    if (changed) forceRender((n) => n + 1);
  }, [bots, byId]);

  // Turn store changes into ticker lines. Nothing is announced until the
  // server's copy has landed, otherwise opening display mode reads as though
  // every bot in the showcase arrived in the same second.
  useEffect(() => {
    if (syncState !== 'live') return;
    const previous = seenRef.current;
    const next = new Map(bots.map((bot) => [bot.id, bot]));
    seenRef.current = next;
    if (!previous) return;

    const fresh: Event[] = [];
    const now = Date.now();
    for (const [id, bot] of next) {
      const before = previous.get(id);
      if (!before) {
        fresh.push({ key: `${id}:joined:${now}`, kind: 'joined', bot, at: now });
        continue;
      }
      if (bot.upvotes > before.upvotes) {
        fresh.push({ key: `${id}:up:${bot.upvotes}`, kind: 'upvote', bot, at: now });
      }
      if (bot.questionCount > before.questionCount) {
        fresh.push({ key: `${id}:q:${bot.questionCount}`, kind: 'question', bot, at: now });
      }
    }
    if (fresh.length === 0) return;

    setEvents((current) =>
      [...fresh.reverse(), ...current]
        .filter((event) => now - event.at < TICKER_KEEP_MS)
        .slice(0, TICKER_MAX),
    );
  }, [bots, syncState]);

  // Expire ticker lines even when nothing new arrives.
  useEffect(() => {
    if (events.length === 0) return;
    const timer = window.setInterval(() => {
      const now = Date.now();
      setEvents((current) => current.filter((event) => now - event.at < TICKER_KEEP_MS));
    }, 5_000);
    return () => window.clearInterval(timer);
  }, [events.length]);

  // A resized window (or a projector taking over) needs new sizes and bounds.
  useEffect(() => {
    const onResize = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      for (const node of nodesRef.current.values()) {
        node.size = sizeFor(node.bot, vw, vh);
      }
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // The motion loop. Writes transforms straight to the DOM — putting sixty
  // positions a second through React state would re-render the whole field.
  useEffect(() => {
    const still = prefersReducedMotion();
    let raf = 0;
    let last = performance.now();

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;

      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const bounds = boundsFor(vw, vh);

      const cam = camRef.current;
      if (!still) {
        cam.x = Math.sin((now / PAN_PERIOD_X_MS) * Math.PI * 2) * vw * PAN_AMPLITUDE;
        cam.y = Math.cos((now / PAN_PERIOD_Y_MS) * Math.PI * 2) * vh * PAN_AMPLITUDE;
      }

      const dimmed = focusedIdRef.current !== null;
      const dragging = dragRef.current?.id;
      const nodes = [...nodesRef.current.values()];

      // Nudge overlapping bots apart, so a crowd spreads out instead of piling
      // up where the newest arrivals land.
      if (!still && nodes.length > 1) {
        for (let i = 0; i < nodes.length; i += 1) {
          for (let j = i + 1; j < nodes.length; j += 1) {
            const a = nodes[i];
            const b = nodes[j];
            const reach = radiusFor(a.size) + radiusFor(b.size) + SEPARATION_GAP;
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const distance = Math.hypot(dx, dy);
            if (distance >= reach) continue;

            // Perfectly coincident bots need an arbitrary direction to escape on.
            const ux = distance > 0.01 ? dx / distance : Math.cos(i * 2.4);
            const uy = distance > 0.01 ? dy / distance : Math.sin(i * 2.4);
            const push = ((reach - distance) / reach) * SEPARATION_PUSH;
            if (a.bot.id !== dragging) {
              a.x -= ux * push;
              a.y -= uy * push;
            }
            if (b.bot.id !== dragging) {
              b.x += ux * push;
              b.y += uy * push;
            }
          }
        }
      }

      for (const node of nodes) {
        const radius = radiusFor(node.size);
        // A held bot stays put; the rest drift and bounce off the edges of frame.
        if (!still && node.bot.id !== dragging) {
          node.x += node.vx * dt;
          node.y += node.vy * dt;
        }
        if (node.bot.id !== dragging) {
          const minX = bounds.minX + radius;
          const maxX = bounds.maxX - radius;
          const minY = bounds.minY + radius;
          const maxY = bounds.maxY - radius;
          if (node.x < minX || node.x > maxX) {
            node.vx = Math.abs(node.vx) * (node.x < minX ? 1 : -1);
            node.x = Math.max(minX, Math.min(maxX, node.x));
          }
          if (node.y < minY || node.y > maxY) {
            node.vy = Math.abs(node.vy) * (node.y < minY ? 1 : -1);
            node.y = Math.max(minY, Math.min(maxY, node.y));
          }
        }

        const el = node.el;
        if (!el) continue;

        const age = now - node.born;
        const pop = age < POP_MS ? easeOutBack(age / POP_MS) : 1;
        const screenX = node.x - cam.x + vw / 2;
        const screenY = node.y - cam.y + vh / 2;

        el.style.transform =
          `translate3d(${screenX.toFixed(1)}px, ${screenY.toFixed(1)}px, 0) ` +
          `translate(-50%, -50%) scale(${pop.toFixed(3)})`;
        el.style.opacity = dimmed && focusedIdRef.current !== node.bot.id ? '0.18' : '1';
        el.classList.toggle('is-new', age < NEW_MS);
      }
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Escape leaves; it is the one key everybody tries.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (focusedIdRef.current) setFocusedId(null);
      else navigate('/');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // If this started itself after a quiet spell, behave like a screensaver and
  // get out of the way at the first sign of life. Entered deliberately, it stays.
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('idle')) return;

    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;
    // A grace period, otherwise the pointer sitting still over the page counts
    // as the movement that dismisses it.
    const dismiss = () => navigate('/');
    const timer = window.setTimeout(() => {
      events.forEach((event) => window.addEventListener(event, dismiss, { passive: true }));
      window.addEventListener('pointermove', dismiss, { passive: true });
    }, 1_200);

    return () => {
      window.clearTimeout(timer);
      events.forEach((event) => window.removeEventListener(event, dismiss));
      window.removeEventListener('pointermove', dismiss);
    };
  }, []);

  useEffect(() => {
    if (!focusedId) return;
    const timer = window.setTimeout(() => setFocusedId(null), FOCUS_AUTO_RETURN_MS);
    return () => window.clearTimeout(timer);
  }, [focusedId]);

  const onPointerDown = useCallback((event: React.PointerEvent, id: string) => {
    event.preventDefault();
    (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
    dragRef.current = { id, lastX: event.clientX, lastY: event.clientY, moved: 0 };
  }, []);

  const onPointerMove = useCallback((event: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const node = nodesRef.current.get(drag.id);
    if (!node) return;

    const dx = event.clientX - drag.lastX;
    const dy = event.clientY - drag.lastY;
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
    drag.moved += Math.hypot(dx, dy);
    node.x += dx;
    node.y += dy;
    // Throwing a bot should leave it moving in that direction.
    node.vx = dx * 12;
    node.vy = dy * 12;
  }, []);

  const onPointerUp = useCallback((event: React.PointerEvent) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    (event.target as HTMLElement).releasePointerCapture?.(event.pointerId);

    const node = nodesRef.current.get(drag.id);
    if (node) {
      const speed = Math.hypot(node.vx, node.vy);
      // Keep a thrown bot from rocketing away for ever.
      if (speed > 220) {
        node.vx = (node.vx / speed) * 220;
        node.vy = (node.vy / speed) * 220;
      }
    }
    if (drag.moved < 5) {
      setFocusedId((current) => (current === drag.id ? null : drag.id));
    }
  }, []);

  const nodes = [...nodesRef.current.values()];

  return (
    <div className="display" onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
      <div className="display-field">
        {nodes.map((node) => (
          <div
            key={node.bot.id}
            className="display-bot"
            ref={(el) => {
              const current = nodesRef.current.get(node.bot.id);
              if (current) current.el = el;
            }}
            onPointerDown={(event) => onPointerDown(event, node.bot.id)}
            role="button"
            tabIndex={-1}
            aria-label={node.bot.name}
          >
            <span className="display-bot-body">
              <BotAvatar color={node.bot.color} shape={node.bot.shape} size={node.size} />
            </span>
            <span className="display-bot-name">{node.bot.name}</span>
            {node.bot.upvotes > 0 && (
              <span className="display-bot-votes">
                <ArrowUp size={11} />
                {node.bot.upvotes}
              </span>
            )}
          </div>
        ))}
      </div>

      {nodes.length === 0 && (
        <div className="display-empty">
          <Sparkles size={20} />
          <p>Waiting for the first bot.</p>
          <p className="display-url">grokbot.cursorsydney.com</p>
        </div>
      )}

      {focused && (
        <div className="display-focus" onClick={() => setFocusedId(null)} role="presentation">
          <div className="display-card" onClick={(event) => event.stopPropagation()} role="presentation">
            <div className="display-card-head">
              <BotAvatar color={focused.color} shape={focused.shape} size={64} />
              <div>
                <h2>{focused.name}</h2>
                <p className="display-card-meta">
                  {focused.owner ? `${focused.owner}'s bot` : 'In the showcase'}
                  {focused.upvotes > 0 && ` · ${focused.upvotes} upvotes`}
                </p>
              </div>
            </div>
            <p className="display-card-body">{focused.description}</p>
            <div className="display-card-actions">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => navigate(`/bot/${focused.id}`)}
              >
                Open its page
              </button>
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => setFocusedId(null)}>
                Back to the field
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="display-ticker">
        <div className="display-events">
          {events.length === 0 ? (
            <span className="display-idle">
              Add yours at <strong>grokbot.cursorsydney.com</strong>
            </span>
          ) : (
            events.map((event) => (
              <span key={event.key} className={`display-event display-event-${event.kind}`}>
                <BotAvatar color={event.bot.color} shape={event.bot.shape} size={18} animated={false} />
                {event.kind === 'joined' && (
                  <>
                    <strong>{event.bot.name}</strong> joined
                    {event.bot.owner ? ` — ${event.bot.owner}'s bot` : ''}
                  </>
                )}
                {event.kind === 'upvote' && (
                  <>
                    <ArrowUp size={12} />
                    <strong>{event.bot.name}</strong> got an upvote
                  </>
                )}
                {event.kind === 'question' && (
                  <>
                    <MessageCircleQuestion size={12} />
                    <strong>{event.bot.name}</strong> was asked something
                  </>
                )}
              </span>
            ))
          )}
        </div>

        <div className="display-totals">
          <span>
            <strong>{totals.bots}</strong> bots
          </span>
          <span>
            <strong>{totals.upvotes}</strong> upvotes
          </span>
          <span>
            <strong>{totals.questions}</strong> questions
          </span>
        </div>
      </div>

      <button type="button" className="display-exit" onClick={() => navigate('/')}>
        <X size={14} />
        Exit display
      </button>
    </div>
  );
};

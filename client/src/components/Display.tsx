import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUp, MessageCircleQuestion, Sparkles, X } from 'lucide-react';
import { type Bot } from '../lib/store';
import { useBots, useSyncState } from '../lib/showcase';
import { navigate } from '../lib/router';
import { type LookSource } from '../lib/eyes';
import { BotAvatar } from './BotAvatar';
import { QrCode } from './QrCode';

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

/** Everyone turns to look at a new arrival, the nearest first, like a ripple through the room. */
const ARRIVAL_STARE_MS = 4_200;
const ARRIVAL_RIPPLE_MS_PER_PX = 0.7;
/** The newcomer itself looks out at the room for a moment before joining in. */
const ARRIVAL_HELLO_MS = 1_600;
/** Two bots that drift into each other exchange a look, but not every time they touch. */
const GLANCE_MS = 1_700;
const GLANCE_COOLDOWN_MS = 9_000;
const BREATH_PERIOD_MS = 3_400;
const BREATH = 0.02;
const LEAN_DEG_PER_SPEED = 0.35;
const LEAN_MAX_DEG = 9;
const LEAN_TAU_S = 0.3;
/** Squash on hitting the edge of frame: a damped wobble. */
const BOUNCE_MS = 650;
const BOUNCE_AMOUNT = 0.14;
const BOUNCE_DECAY_S = 0.14;
const BOUNCE_PERIOD_S = 0.3;
/**
 * Names stay hidden, since long ones sprawl across the field. Instead the bots
 * take turns: one hops and shows its name, and its neighbours turn to look.
 * Everyone gets a turn before anyone gets a second.
 */
const NAME_EVERY_MS = 2_600;
const NAME_SHOW_MS = 4_800;
const HOP_MS = 560;
/** Hop height, as a fraction of the bot's size. */
const HOP_HEIGHT = 0.28;
const HOP_NOTICE_MS = 2_800;
const HOP_NOTICE_PX = 320;
/** Where the QR code sends people. The display may be served from another origin. */
const ADD_URL = 'https://grokbot.cursorsydney.com/submit';
const QR_SIZE = 132;

interface Node {
  bot: Bot;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  born: number;
  el: HTMLDivElement | null;
  bodyEl: HTMLSpanElement | null;
  svgEl: SVGSVGElement | null;
  /** Steers this bot's eyes; stable for the node's lifetime, as BotAvatar requires. */
  look: LookSource;
  phase: number;
  lean: number;
  bounceAt: number;
  bounceAxis: 'x' | 'y';
  glanceAt: string | null;
  glanceUntil: number;
  glanceCooldown: number;
  hopAt: number;
  landed: boolean;
  nameUntil: number;
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

/** Footprint, with a little breathing room. Names are hidden most of the time, so they do not count. */
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

/**
 * The body's own motion, under the drift: a slow breath, a lean into the
 * direction of travel, and a wobble when it hits the edge of frame.
 * `dt` is in seconds.
 */
function bodyTransform(node: Node, now: number, dt: number): string {
  const breath = Math.sin((now / BREATH_PERIOD_MS) * Math.PI * 2 + node.phase);
  let sx = 1 - breath * BREATH * 0.7;
  let sy = 1 + breath * BREATH;

  const since = now - node.bounceAt;
  if (since < BOUNCE_MS) {
    const s = since / 1000;
    const wobble =
      BOUNCE_AMOUNT * Math.exp(-s / BOUNCE_DECAY_S) * Math.cos((s / BOUNCE_PERIOD_S) * Math.PI * 2);
    if (node.bounceAxis === 'x') {
      sx *= 1 - wobble;
      sy *= 1 + wobble * 0.7;
    } else {
      sy *= 1 - wobble;
      sx *= 1 + wobble * 0.7;
    }
  }

  let lift = 0;
  const hop = (now - node.hopAt) / HOP_MS;
  if (hop >= 0 && hop < 1) {
    const arc = Math.sin(Math.PI * hop);
    lift = arc * node.size * HOP_HEIGHT;
    sy *= 1 + arc * 0.08;
    sx *= 1 - arc * 0.05;
  } else if (hop >= 1 && !node.landed) {
    node.landed = true;
    node.bounceAt = now;
    node.bounceAxis = 'y';
  }

  const lean = Math.max(-LEAN_MAX_DEG, Math.min(node.vx * LEAN_DEG_PER_SPEED, LEAN_MAX_DEG));
  node.lean += (lean - node.lean) * (1 - Math.exp(-dt / LEAN_TAU_S));

  return (
    `translateY(${(-lift).toFixed(1)}px) rotate(${node.lean.toFixed(2)}deg) ` +
    `scale(${sx.toFixed(4)}, ${sy.toFixed(4)})`
  );
}

/** Picks the next bot to hop and show its name, cycling through a shuffled order. */
function callOnStage(nodes: Map<string, Node>, queue: string[], now: number): void {
  for (let attempts = 0; attempts < 2; attempts += 1) {
    if (queue.length === 0) {
      queue.push(...[...nodes.keys()].sort(() => Math.random() - 0.5));
    }
    while (queue.length > 0) {
      const node = nodes.get(queue.pop()!);
      if (!node) continue;
      node.hopAt = now;
      node.landed = false;
      node.nameUntil = now + NAME_SHOW_MS;
      return;
    }
  }
}

/** Pushes a bot out of a screen-space rectangle it is not allowed to drift under. */
function avoidRect(node: Node, rect: Bounds, radius: number, now: number): void {
  const minX = rect.minX - radius;
  const maxX = rect.maxX + radius;
  const minY = rect.minY - radius;
  const maxY = rect.maxY + radius;
  if (node.x <= minX || node.x >= maxX || node.y <= minY || node.y >= maxY) return;

  const exits = [node.x - minX, maxX - node.x, node.y - minY, maxY - node.y];
  const side = exits.indexOf(Math.min(...exits));
  if (side < 2) {
    node.x = side === 0 ? minX : maxX;
    node.vx = Math.abs(node.vx) * (side === 0 ? -1 : 1);
    node.bounceAxis = 'x';
  } else {
    node.y = side === 2 ? minY : maxY;
    node.vy = Math.abs(node.vy) * (side === 2 ? -1 : 1);
    node.bounceAxis = 'y';
  }
  node.bounceAt = now;
}

/**
 * What each bot is looking at, most interesting first: a bot being dragged, then
 * a new arrival, then a neighbour showing its name, then whoever it just bumped
 * into. Otherwise it is left to the
 * shared eye loop, which follows the pointer or has the bots look at each other.
 */
function steerGazes(nodes: Node[], draggingId: string | undefined, now: number): void {
  const byId = new Map(nodes.map((node) => [node.bot.id, node]));
  const dragged = draggingId ? byId.get(draggingId) : undefined;

  let newest: Node | undefined;
  let hopper: Node | undefined;
  for (const node of nodes) {
    if (now - node.born < ARRIVAL_STARE_MS && (!newest || node.born > newest.born)) newest = node;
    if (now - node.hopAt < HOP_NOTICE_MS && (!hopper || node.hopAt > hopper.hopAt)) hopper = node;
  }

  for (const node of nodes) {
    let target: Node | undefined;
    if (dragged) {
      target = dragged;
    } else if (newest) {
      const ripple = Math.hypot(node.x - newest.x, node.y - newest.y) * ARRIVAL_RIPPLE_MS_PER_PX;
      if (node === newest) {
        if (now - node.born < ARRIVAL_HELLO_MS) target = node;
      } else if (now - newest.born > ripple) {
        target = newest;
      }
    }
    if (!target && hopper) {
      if (node === hopper || Math.hypot(node.x - hopper.x, node.y - hopper.y) < HOP_NOTICE_PX) {
        target = hopper;
      }
    }
    if (!target && node.glanceAt && now < node.glanceUntil) {
      target = byId.get(node.glanceAt);
    }
    // Looking at itself is looking straight out, at the room.
    node.look.current = target?.svgEl ?? null;
  }
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
  const qrRef = useRef<HTMLDivElement>(null);
  const qrRectRef = useRef<Bounds | null>(null);

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
        bodyEl: null,
        svgEl: null,
        look: { current: null },
        phase: hash01(bot.id, 5) * Math.PI * 2,
        lean: 0,
        bounceAt: Number.NEGATIVE_INFINITY,
        bounceAxis: 'x',
        glanceAt: null,
        glanceUntil: 0,
        glanceCooldown: 0,
        hopAt: Number.NEGATIVE_INFINITY,
        landed: true,
        nameUntil: 0,
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
      // Measured here rather than per frame: it only moves when the window does.
      const box = qrRef.current?.getBoundingClientRect();
      qrRectRef.current =
        box && box.width > 0
          ? { minX: box.left, maxX: box.right, minY: box.top, maxY: box.bottom }
          : null;
    };
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // The motion loop. Writes transforms straight to the DOM — putting sixty
  // positions a second through React state would re-render the whole field.
  useEffect(() => {
    const still = prefersReducedMotion();
    let raf = 0;
    let last = performance.now();
    let nextNameAt = last + NAME_EVERY_MS;
    const nameQueue: string[] = [];

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

      if (now >= nextNameAt && nodes.length > 0) {
        callOnStage(nodesRef.current, nameQueue, now);
        nextNameAt = now + NAME_EVERY_MS * (0.8 + Math.random() * 0.4);
      }

      const qr = qrRectRef.current;
      const qrWorld: Bounds | null = qr && {
        minX: qr.minX - vw / 2 + cam.x,
        maxX: qr.maxX - vw / 2 + cam.x,
        minY: qr.minY - vh / 2 + cam.y,
        maxY: qr.maxY - vh / 2 + cam.y,
      };

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

            if (now > a.glanceCooldown && now > b.glanceCooldown) {
              a.glanceAt = b.bot.id;
              b.glanceAt = a.bot.id;
              a.glanceUntil = now + GLANCE_MS;
              b.glanceUntil = now + GLANCE_MS + 300;
              a.glanceCooldown = now + GLANCE_COOLDOWN_MS * (0.7 + hash01(a.bot.id, 6) * 0.6);
              b.glanceCooldown = now + GLANCE_COOLDOWN_MS * (0.7 + hash01(b.bot.id, 6) * 0.6);
            }

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
            if ((node.x < minX && node.vx < 0) || (node.x > maxX && node.vx > 0)) {
              node.bounceAt = now;
              node.bounceAxis = 'x';
            }
            node.vx = Math.abs(node.vx) * (node.x < minX ? 1 : -1);
            node.x = Math.max(minX, Math.min(maxX, node.x));
          }
          if (node.y < minY || node.y > maxY) {
            if ((node.y < minY && node.vy < 0) || (node.y > maxY && node.vy > 0)) {
              node.bounceAt = now;
              node.bounceAxis = 'y';
            }
            node.vy = Math.abs(node.vy) * (node.y < minY ? 1 : -1);
            node.y = Math.max(minY, Math.min(maxY, node.y));
          }
          if (qrWorld) avoidRect(node, qrWorld, radius, now);
        }

        if (!still && node.bodyEl) {
          node.bodyEl.style.transform = bodyTransform(node, now, dt);
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
        el.classList.toggle(
          'is-named',
          now < node.nameUntil || age < NEW_MS || node.bot.id === dragging,
        );
      }

      steerGazes(nodes, dragging, now);
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
            <span
              className="display-bot-body"
              ref={(el) => {
                const current = nodesRef.current.get(node.bot.id);
                if (!current) return;
                current.bodyEl = el;
                current.svgEl = el?.querySelector('svg') ?? null;
              }}
            >
              <BotAvatar
                color={node.bot.color}
                shape={node.bot.shape}
                size={node.size}
                lookAt={node.look}
                live
              />
            </span>
            <span className="display-bot-label">
              <span className="display-bot-name">{node.bot.name}</span>
              {node.bot.upvotes > 0 && (
                <span className="display-bot-votes">
                  <ArrowUp size={11} />
                  {node.bot.upvotes}
                </span>
              )}
            </span>
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

      <div className="display-qr" ref={qrRef}>
        <QrCode value={ADD_URL} size={QR_SIZE} className="display-qr-code" />
        <span>Scan to add your bot</span>
      </div>

      <button type="button" className="display-exit" onClick={() => navigate('/')}>
        <X size={14} />
        Exit display
      </button>
    </div>
  );
};

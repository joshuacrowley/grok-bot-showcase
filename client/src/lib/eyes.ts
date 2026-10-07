import { type Profile } from './botGeometry';
import { REST_GAZE, eyeFrames } from './botFace';

/**
 * Shared eye animation for every bot avatar on the page.
 *
 * Each bot has a head pose (see `botFace.ts`) that turns toward whatever it is
 * looking at. While the pointer moves, that is the pointer. Once it has been
 * still for a few seconds — or on a display nobody touches — the bots get
 * social: each picks a nearby bot to look at for a few seconds, sometimes gets
 * looked back at, and now and then just gazes off in its resting pose.
 *
 * A caller can also steer a bot directly with a `LookSource`, which is how
 * display mode makes the whole room turn toward a new arrival.
 *
 * One requestAnimationFrame loop drives every registered avatar and writes SVG
 * transforms directly. Doing this through React state would re-render the whole
 * grid sixty times a second.
 */

export interface LookPoint {
  x: number;
  y: number;
}

/** A viewport point, or an element — another avatar's `<svg>` tracks it as it moves. */
export type LookTarget = LookPoint | Element;

/** Read every frame, so gaze can be steered without re-rendering. `null` is the default behaviour. */
export interface LookSource {
  current: LookTarget | null;
}

/** Head turn at full reach, in degrees. Wider than bloub's, which draws one large bot. */
const YAW_MAX = 30;
const PITCH_MAX = 24;
/** Looking at something level holds the head slightly up, which reads as attentive. */
const LOOK_PITCH = 8;

/** Turn speed varies per bot, so a grid of them does not move as one object. */
const TURN_TAU_MS: [number, number] = [90, 200];
/** Blending between the resting pose and a target is slower than turning between targets. */
const MIX_TAU_MS = 260;

/**
 * Distance at which a bot is looking as hard as it can, scaled by its size. A
 * fixed reach made small avatars barely react to a neighbour beside them.
 */
const REACH_PER_SIZE = 2.4;
const REACH_PX: [number, number] = [110, 260];

/** How long the pointer must be still before bots start looking at each other. */
const SOCIAL_AFTER_MS = 3_500;
/** Extra per-bot delay, so the room drifts into it rather than switching at once. */
const SOCIAL_STAGGER_MS = 1_800;
const SOCIAL_RANGE_PX = 560;
const FOCUS_HOLD_MS: [number, number] = [1_800, 5_200];
const REST_HOLD_MS: [number, number] = [1_400, 3_400];
const REST_CHANCE = 0.25;
const RECIPROCATE_CHANCE = 0.5;
const BLINK_ON_SWITCH_CHANCE = 0.35;

const BLINK_INTERVAL_MS: [number, number] = [2_600, 6_000];
const BLINK_MS = 200;
const DOUBLE_BLINK_CHANCE = 0.18;
const DOUBLE_BLINK_GAP_MS = 70;

/** Avatars only move when the page scrolls or relayouts, so polling is enough unless `live`. */
const RECT_REFRESH_MS = 250;

interface Instance {
  eyes: [SVGGraphicsElement, SVGGraphicsElement];
  svg: SVGSVGElement;
  profile: Profile;
  scale: number;
  lookAt: LookSource | null;
  live: boolean;
  x: number;
  y: number;
  size: number;
  measured: boolean;
  turnTau: number;
  yaw: number;
  pitch: number;
  mix: number;
  blinkT: number;
  nextBlink: number;
  doubleBlink: boolean;
  phase: number;
  socialDelay: number;
  focus: Instance | null;
  focusUntil: number;
}

const instances = new Set<Instance>();
const bySvg = new Map<Element, Instance>();

let rafId = 0;
let lastNow = 0;
let rectAge = Number.POSITIVE_INFINITY;
let pointerX = 0;
let pointerY = 0;
let pointerAt = Number.NEGATIVE_INFINITY;
let listening = false;

function randBetween([a, b]: [number, number]): number {
  return a + Math.random() * (b - a);
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

/** Closes fast and opens slightly slower, which is what reads as a blink. */
function lidFor(blinkT: number): number {
  if (blinkT < 0 || blinkT >= BLINK_MS) return 1;
  const k = blinkT / BLINK_MS;
  return k < 0.45 ? 1 - k / 0.45 : (k - 0.45) / 0.55;
}

function measure(instance: Instance): void {
  // The <svg> itself, never the eye paths: those carry the transform we write.
  const box = instance.svg.getBoundingClientRect();
  if (box.width === 0) {
    instance.measured = false;
    return;
  }
  instance.x = box.x + box.width / 2;
  instance.y = box.y + box.height / 2;
  instance.size = box.width;
  instance.measured = true;
}

function onScreen(instance: Instance): boolean {
  const margin = instance.size;
  return (
    instance.x > -margin &&
    instance.y > -margin &&
    instance.x < window.innerWidth + margin &&
    instance.y < window.innerHeight + margin
  );
}

function startBlink(instance: Instance): void {
  if (instance.blinkT < 0) instance.blinkT = 0;
}

function advanceBlink(instance: Instance, dt: number): void {
  if (instance.blinkT >= 0) {
    instance.blinkT += dt;
    if (instance.blinkT < BLINK_MS) return;
    instance.blinkT = -1;
    if (instance.doubleBlink) {
      instance.doubleBlink = false;
      instance.nextBlink = DOUBLE_BLINK_GAP_MS;
    } else {
      instance.doubleBlink = Math.random() < DOUBLE_BLINK_CHANCE;
      instance.nextBlink = randBetween(BLINK_INTERVAL_MS);
    }
    return;
  }
  instance.nextBlink -= dt;
  if (instance.nextBlink <= 0) instance.blinkT = 0;
}

/** Nearer bots are likelier picks; sometimes none, so the room is not all staring. */
function chooseFocus(instance: Instance, now: number): void {
  const previous = instance.focus;
  const candidates: Array<[Instance, number]> = [];
  let total = 0;
  for (const other of instances) {
    if (other === instance || !other.measured || !onScreen(other)) continue;
    const distance = Math.hypot(other.x - instance.x, other.y - instance.y);
    if (distance < 1 || distance > SOCIAL_RANGE_PX) continue;
    const weight = 1 / (distance + 60);
    candidates.push([other, weight]);
    total += weight;
  }

  if (candidates.length === 0 || Math.random() < REST_CHANCE) {
    instance.focus = null;
    instance.focusUntil = now + randBetween(REST_HOLD_MS);
  } else {
    let pick = Math.random() * total;
    let chosen = candidates[0][0];
    for (const [other, weight] of candidates) {
      pick -= weight;
      chosen = other;
      if (pick <= 0) break;
    }
    instance.focus = chosen;
    instance.focusUntil = now + randBetween(FOCUS_HOLD_MS);

    if (chosen.focus !== instance && !chosen.lookAt?.current && Math.random() < RECIPROCATE_CHANCE) {
      chosen.focus = instance;
      chosen.focusUntil = instance.focusUntil + randBetween([-400, 600]);
    }
  }

  if (instance.focus !== previous && Math.random() < BLINK_ON_SWITCH_CHANCE) startBlink(instance);
}

function resolve(target: LookTarget): LookPoint | null {
  if (!(target instanceof Element)) return target;
  const other = bySvg.get(target);
  if (other) return other.measured ? other : null;
  const box = target.getBoundingClientRect();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

function targetFor(instance: Instance, now: number): LookPoint | null {
  const steered = instance.lookAt?.current;
  if (steered) return resolve(steered);

  if (now - pointerAt < SOCIAL_AFTER_MS + instance.socialDelay) {
    return { x: pointerX, y: pointerY };
  }

  if (now >= instance.focusUntil || (instance.focus && !instances.has(instance.focus))) {
    chooseFocus(instance, now);
  }
  return instance.focus?.measured ? instance.focus : null;
}

function aim(instance: Instance, target: LookPoint | null, dt: number): void {
  let yaw = instance.yaw;
  let pitch = instance.pitch;
  let mix = 0;

  if (target && instance.measured) {
    const dx = target.x - instance.x;
    const dy = target.y - instance.y;
    const distance = Math.hypot(dx, dy);
    const reach = Math.max(REACH_PX[0], Math.min(instance.size * REACH_PER_SIZE, REACH_PX[1]));
    // A target right on top of the bot is the viewer: it looks straight out.
    const unit = distance > 1e-3 ? smoothstep(Math.min(distance / reach, 1)) / distance : 0;
    yaw = dx * unit * YAW_MAX;
    pitch = LOOK_PITCH - dy * unit * PITCH_MAX;
    mix = 1;
  }

  const turn = 1 - Math.exp(-dt / instance.turnTau);
  instance.yaw += (yaw - instance.yaw) * turn;
  instance.pitch += (pitch - instance.pitch) * turn;
  instance.mix += (mix - instance.mix) * (1 - Math.exp(-dt / MIX_TAU_MS));
}

function write(instance: Instance, now: number): void {
  // Slow wandering on incommensurate periods, quieter while looking at something.
  const t = now / 1000 + instance.phase;
  const wander = 1 - 0.7 * instance.mix;
  const mix = instance.mix;
  const gaze = {
    yaw:
      REST_GAZE.yaw + (instance.yaw - REST_GAZE.yaw) * mix +
      (Math.sin(t * 0.56) * 4.2 + Math.sin(t * 1.7 + 1.3) * 1.3) * wander,
    pitch:
      REST_GAZE.pitch + (instance.pitch - REST_GAZE.pitch) * mix +
      (Math.sin(t * 0.69 + 2.1) * 3.2 + Math.sin(t * 1.46 + 0.7) * 1) * wander,
    roll: REST_GAZE.roll + Math.sin(t * 0.46 + 3.2) * 2,
  };

  const frames = eyeFrames(instance.profile, gaze, lidFor(instance.blinkT), instance.scale);
  for (let i = 0; i < 2; i += 1) {
    instance.eyes[i].setAttribute('transform', frames[i].transform);
    instance.eyes[i].setAttribute('opacity', frames[i].opacity.toFixed(3));
  }
}

function step(now: number): void {
  rafId = requestAnimationFrame(step);

  const dt = Math.min(now - lastNow, 100);
  lastNow = now;

  rectAge += dt;
  const refresh = rectAge >= RECT_REFRESH_MS;
  if (refresh) rectAge = 0;

  // Every read before any write, so layout is flushed at most once a frame.
  for (const instance of instances) {
    if (refresh || instance.live || !instance.measured) measure(instance);
  }

  for (const instance of instances) {
    advanceBlink(instance, dt);
    aim(instance, targetFor(instance, now), dt);
    write(instance, now);
  }
}

function onPointerMove(event: PointerEvent): void {
  // A lifted finger would leave every bot staring at the last spot touched.
  if (event.pointerType === 'touch') return;
  pointerX = event.clientX;
  pointerY = event.clientY;
  pointerAt = performance.now();
}

function onPointerLeave(): void {
  pointerAt = Number.NEGATIVE_INFINITY;
}

function invalidateRects(): void {
  rectAge = Number.POSITIVE_INFINITY;
}

function startListening(): void {
  if (listening) return;
  listening = true;
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  document.documentElement.addEventListener('mouseleave', onPointerLeave);
  window.addEventListener('scroll', invalidateRects, { passive: true, capture: true });
  window.addEventListener('resize', invalidateRects);
}

function stopListening(): void {
  if (!listening) return;
  listening = false;
  window.removeEventListener('pointermove', onPointerMove);
  document.documentElement.removeEventListener('mouseleave', onPointerLeave);
  window.removeEventListener('scroll', invalidateRects, { capture: true });
  window.removeEventListener('resize', invalidateRects);
}

export interface EyesOptions {
  /** The two eye paths, already shaped by `eyePath` and centred on the origin. */
  eyes: [SVGGraphicsElement, SVGGraphicsElement];
  profile: Profile;
  /** Body radius in viewBox units. */
  scale: number;
  lookAt?: LookSource;
  /** Remeasure every frame, for avatars that move on their own. */
  live?: boolean;
}

/**
 * Starts animating one avatar's eyes. Returns the teardown, so a caller can
 * hand it straight back from an effect.
 */
export function registerEyes({ eyes, profile, scale, lookAt, live = false }: EyesOptions): () => void {
  const svg = eyes[0].ownerSVGElement;
  if (prefersReducedMotion() || !svg) return () => {};

  const instance: Instance = {
    eyes,
    svg,
    profile,
    scale,
    lookAt: lookAt ?? null,
    live,
    x: 0,
    y: 0,
    size: 0,
    measured: false,
    turnTau: randBetween(TURN_TAU_MS),
    yaw: REST_GAZE.yaw,
    pitch: REST_GAZE.pitch,
    mix: 0,
    blinkT: -1,
    // Staggered so they do not all blink together on first paint.
    nextBlink: Math.random() * 3_000 + randBetween(BLINK_INTERVAL_MS) * 0.25,
    doubleBlink: false,
    phase: Math.random() * 100,
    socialDelay: Math.random() * SOCIAL_STAGGER_MS,
    focus: null,
    focusUntil: 0,
  };

  instances.add(instance);
  bySvg.set(svg, instance);
  startListening();
  if (!rafId) {
    lastNow = performance.now();
    rafId = requestAnimationFrame(step);
  }

  return () => {
    instances.delete(instance);
    if (bySvg.get(svg) === instance) bySvg.delete(svg);
    const rest = eyeFrames(profile, REST_GAZE, 1, scale);
    eyes.forEach((eye, i) => {
      eye.setAttribute('transform', rest[i].transform);
      eye.setAttribute('opacity', String(rest[i].opacity));
    });
    if (instances.size === 0) {
      cancelAnimationFrame(rafId);
      rafId = 0;
      stopListening();
    }
  };
}

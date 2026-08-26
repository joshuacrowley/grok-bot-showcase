/**
 * Shared eye animation for every bot avatar on the page: look-tracking, blinks
 * and a slow idle drift.
 *
 * Timings and curves follow the creature.company eye behaviour. The difference
 * here is that these bots have no pupils — the white slits are the whole eye, so
 * they take the travel a pupil would normally get, scaled down to stay inside
 * the body.
 *
 * One requestAnimationFrame loop drives every registered avatar and writes SVG
 * transforms directly. Doing this through React state would re-render the whole
 * grid sixty times a second.
 */

const VIEWBOX = 64;

// Straight from the reference behaviour.
const LOOK_MAX_MAG = 0.75;
const LOOK_SMOOTH_MIN_MS = 100;
const LOOK_SMOOTH_MAX_MS = 250;
const LOOK_INTRO_MS = 600;
const BLINK_INTERVAL: [number, number] = [3000, 6000];
const BLINK_CLOSE_MS = 250;
const BLINK_OPEN_MS = 200;

/** How far the slits travel, in viewBox units. Tuned to stay inside every shape. */
const LOOK_X = 5;
const LOOK_Y = 3.6;

/**
 * Distance at which an eye is looking as hard as it can, in pixels.
 *
 * A deliberate departure from the reference, which ramps over half the viewport
 * because it draws one huge pair of eyes in the middle of the screen. These
 * avatars are small and scattered, so that ramp made an avatar near the left
 * edge barely look left while permanently straining right. Saturating a few
 * avatar-widths out means every bot points at the cursor, while still easing to
 * centre when the cursor is right on top of one.
 */
const LOOK_REACH_PX = 240;
const IDLE_X = 0.45;
const IDLE_Y = 0.3;

/** How closed a blink gets. The reference bottoms out at 0.18 with a pupil to hide. */
const BLINK_MIN_SCALE = 0.14;

/** Second smoothing stage, on top of the per-eye cursor lag. */
const BLEND_TAU_MS = 40;

/** Avatars only move when the page scrolls or relayouts, so polling is enough. */
const RECT_REFRESH_MS = 250;

interface Instance {
  eyes: SVGGraphicsElement;
  svg: SVGSVGElement;
  /** Eye centre in viewBox units, which differs per shape. */
  cx: number;
  cy: number;
  screenX: number;
  screenY: number;
  measured: boolean;
  tau: number;
  cursorX: number;
  cursorY: number;
  tracking: boolean;
  offX: number;
  offY: number;
  blinkT: number;
  nextBlink: number;
  idlePhase: number;
}

const instances = new Set<Instance>();

let rafId = 0;
let lastNow = 0;
let rectAge = Number.POSITIVE_INFINITY;
let cursorX = 0;
let cursorY = 0;
let cursorSeen = false;
let introT = 0;
let listening = false;

function randBetween(a: number, b: number): number {
  return a + Math.random() * (b - a);
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

/** Closes fast and opens slightly slower, which is what reads as a blink. */
function blinkScaleY(blinkT: number): number {
  if (blinkT < 0) return 1;
  const total = BLINK_CLOSE_MS + BLINK_OPEN_MS;
  if (blinkT >= total) return 1;

  const range = 1 - BLINK_MIN_SCALE;
  if (blinkT < BLINK_CLOSE_MS) {
    return 1 - range * smoothstep(blinkT / BLINK_CLOSE_MS);
  }
  return BLINK_MIN_SCALE + range * smoothstep((blinkT - BLINK_CLOSE_MS) / BLINK_OPEN_MS);
}

function measure(instance: Instance): void {
  // Measured from the untransformed <svg>, not the eye group. Measuring the
  // group would read back the offset we just wrote and drift.
  const box = instance.svg.getBoundingClientRect();
  if (box.width === 0) {
    instance.measured = false;
    return;
  }
  instance.screenX = box.x + (instance.cx / VIEWBOX) * box.width;
  instance.screenY = box.y + (instance.cy / VIEWBOX) * box.height;
  instance.measured = true;
}

function onPointerMove(event: PointerEvent): void {
  cursorX = event.clientX;
  cursorY = event.clientY;
  cursorSeen = true;
}

function invalidateRects(): void {
  rectAge = Number.POSITIVE_INFINITY;
}

function startListening(): void {
  if (listening) return;
  listening = true;
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  window.addEventListener('scroll', invalidateRects, { passive: true, capture: true });
  window.addEventListener('resize', invalidateRects);
}

function stopListening(): void {
  if (!listening) return;
  listening = false;
  window.removeEventListener('pointermove', onPointerMove);
  window.removeEventListener('scroll', invalidateRects, { capture: true });
  window.removeEventListener('resize', invalidateRects);
}

function step(now: number): void {
  rafId = requestAnimationFrame(step);

  const dt = Math.min(now - lastNow, 100);
  lastNow = now;

  if (cursorSeen) introT = Math.min(1, introT + dt / LOOK_INTRO_MS);
  const introW = easeInOutCubic(introT);

  const blend = 1 - Math.exp(-dt / BLEND_TAU_MS);

  rectAge += dt;
  const refresh = rectAge >= RECT_REFRESH_MS;
  if (refresh) rectAge = 0;

  for (const instance of instances) {
    if (refresh || !instance.measured) measure(instance);

    if (instance.blinkT >= 0) {
      instance.blinkT += dt;
      if (instance.blinkT >= BLINK_CLOSE_MS + BLINK_OPEN_MS) {
        instance.blinkT = -1;
        instance.nextBlink = randBetween(BLINK_INTERVAL[0], BLINK_INTERVAL[1]);
      }
    } else {
      instance.nextBlink -= dt;
      if (instance.nextBlink <= 0) instance.blinkT = 0;
    }

    const idleX = Math.sin(now * 0.00165 + instance.idlePhase) * IDLE_X;
    const idleY = Math.cos(now * 0.00122 + instance.idlePhase * 1.3) * IDLE_Y;

    let targetX = idleX;
    let targetY = idleY;

    if (cursorSeen && instance.measured) {
      const k = 1 - Math.exp(-dt / instance.tau);
      if (!instance.tracking) {
        instance.cursorX = cursorX;
        instance.cursorY = cursorY;
        instance.tracking = true;
      }
      instance.cursorX += (cursorX - instance.cursorX) * k;
      instance.cursorY += (cursorY - instance.cursorY) * k;

      const dx = instance.cursorX - instance.screenX;
      const dy = instance.cursorY - instance.screenY;
      const dist = Math.hypot(dx, dy);
      if (dist > 1e-3) {
        // Eases to centre when the cursor is on the eye, saturates beyond reach.
        const mag = smoothstep(Math.min(dist / LOOK_REACH_PX, 1)) * LOOK_MAX_MAG * introW;
        const gain = 1 + 0.22 * mag;
        const unit = mag / dist;
        targetX += dx * unit * LOOK_X * gain;
        targetY += dy * unit * LOOK_Y * gain;
      }
    }

    instance.offX += (targetX - instance.offX) * blend;
    instance.offY += (targetY - instance.offY) * blend;

    const scaleY = blinkScaleY(instance.blinkT);
    instance.eyes.setAttribute(
      'transform',
      `translate(${instance.offX.toFixed(3)} ${instance.offY.toFixed(3)}) ` +
        `translate(${instance.cx} ${instance.cy}) scale(1 ${scaleY.toFixed(4)}) ` +
        `translate(${-instance.cx} ${-instance.cy})`,
    );
  }
}

/**
 * Starts animating one avatar's eyes. Returns the teardown, so a caller can
 * hand it straight back from an effect.
 */
export function registerEyes(
  eyes: SVGGraphicsElement,
  cx: number,
  cy: number,
): () => void {
  if (prefersReducedMotion()) return () => {};

  const instance: Instance = {
    eyes,
    svg: eyes.ownerSVGElement!,
    cx,
    cy,
    screenX: 0,
    screenY: 0,
    measured: false,
    // Each eye lags by a slightly different amount, so a grid of bots does not
    // move as one object.
    tau: randBetween(LOOK_SMOOTH_MIN_MS, LOOK_SMOOTH_MAX_MS),
    cursorX: 0,
    cursorY: 0,
    tracking: false,
    offX: 0,
    offY: 0,
    blinkT: -1,
    // Staggered so they do not all blink together on first paint.
    nextBlink: randBetween(0, 3000) + randBetween(BLINK_INTERVAL[0], BLINK_INTERVAL[1]) * 0.25,
    idlePhase: Math.random() * Math.PI * 2,
  };

  instances.add(instance);
  startListening();
  if (!rafId) {
    lastNow = performance.now();
    rafId = requestAnimationFrame(step);
  }

  return () => {
    instances.delete(instance);
    eyes.removeAttribute('transform');
    if (instances.size === 0) {
      cancelAnimationFrame(rafId);
      rafId = 0;
      stopListening();
    }
  };
}

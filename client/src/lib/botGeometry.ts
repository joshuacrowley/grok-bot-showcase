/**
 * Bot silhouettes as radial profiles: r(theta) sampled at a fixed number of
 * angles, in units of the body radius. Every shape shares the same sampling, so
 * anything sitting on the body (the eyes) can ask how far the edge is in any
 * direction.
 *
 * Adapted from bloub (https://github.com/jeremy-prt/bloub), an SVG recreation of
 * the x.ai bot avatar. MIT License, Copyright (c) 2026 Jérémy Perret.
 *
 * Theta = 0 points right and grows clockwise, because screen y points down.
 */

export const SAMPLES = 64;

export type Profile = readonly number[];

export interface Point {
  x: number;
  y: number;
}

const TAU = Math.PI * 2;
const ANGLES = Array.from({ length: SAMPLES }, (_, i) => (i / SAMPLES) * TAU);
const COS = ANGLES.map(Math.cos);
const SIN = ANGLES.map(Math.sin);

const r2 = (value: number) => Math.round(value * 100) / 100;

export function circleProfile(): number[] {
  return new Array<number>(SAMPLES).fill(1);
}

/** |x|^n + |y|^n = 1. n = 2 is a circle, around 4 reads as a squircle. */
export function superellipseProfile(n: number, sx = 1, sy = 1): number[] {
  return ANGLES.map((_, i) => {
    const c = Math.abs(COS[i] / sx) ** n;
    const s = Math.abs(SIN[i] / sy) ** n;
    return (c + s) ** (-1 / n);
  });
}

export function polarProfile(radiusAt: (angle: number) => number): number[] {
  return ANGLES.map(radiusAt);
}

/** A circle perturbed by cosine terms: [frequency, amplitude, phase]. */
export function harmonicProfile(terms: ReadonlyArray<[number, number, number]>): number[] {
  return polarProfile((angle) =>
    terms.reduce((r, [k, amp, phase]) => r + amp * Math.cos(k * angle + phase), 1),
  );
}

/** Exact while the origin sits inside the union, which every caller keeps true. */
export function unionOfCirclesProfile(
  circles: ReadonlyArray<{ x: number; y: number; r: number }>,
): number[] {
  return ANGLES.map((_, i) => {
    let best = 0;
    for (const c of circles) {
      const b = COS[i] * c.x + SIN[i] * c.y;
      const disc = b * b - (c.x * c.x + c.y * c.y - c.r * c.r);
      if (disc < 0) continue;
      best = Math.max(best, b + Math.sqrt(disc));
    }
    return best;
  });
}

/** Ray-casts a closed polygon from the origin. */
function profileFromPolygon(poly: Point[]): number[] {
  return ANGLES.map((_, k) => {
    const dx = COS[k];
    const dy = SIN[k];
    let best = 0;
    for (let i = 0; i < poly.length; i += 1) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      const ex = b.x - a.x;
      const ey = b.y - a.y;
      const den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-9) continue;
      const t = (a.x * ey - a.y * ex) / den;
      const u = (a.x * dy - a.y * dx) / den;
      if (t > best && u >= 0 && u <= 1) best = t;
    }
    return best;
  });
}

/** Convex hull of two circles: a capsule, or a teardrop when the radii differ. */
export function hullOfCirclesProfile(
  x1: number,
  y1: number,
  ra: number,
  x2: number,
  y2: number,
  rb: number,
  steps = 96,
): number[] {
  const dist = Math.hypot(x2 - x1, y2 - y1) || 1e-6;
  const base = Math.atan2(y2 - y1, x2 - x1);
  const spread = Math.acos(Math.max(-1, Math.min(1, (ra - rb) / dist)));
  const pts: Point[] = [];
  for (let i = 0; i <= steps / 2; i += 1) {
    const a = base + spread + ((TAU - 2 * spread) * i) / (steps / 2);
    pts.push({ x: x1 + Math.cos(a) * ra, y: y1 + Math.sin(a) * ra });
  }
  for (let i = 0; i <= steps / 2; i += 1) {
    const a = base - spread + (2 * spread * i) / (steps / 2);
    pts.push({ x: x2 + Math.cos(a) * rb, y: y2 + Math.sin(a) * rb });
  }
  return profileFromPolygon(pts);
}

/**
 * Regular polygon with rounded corners, by Minkowski sum with a disc of radius
 * `rc`, so `radius` is where the rounded corners end up.
 */
export function roundedPolygonProfile(
  sides: number,
  radius: number,
  rc: number,
  rotationDeg = 0,
  arcSteps = 10,
): number[] {
  const rot = (rotationDeg * Math.PI) / 180;
  const verts = Array.from({ length: sides }, (_, i) => {
    const a = rot + (i / sides) * TAU;
    return { x: Math.cos(a) * (radius - rc), y: Math.sin(a) * (radius - rc) };
  });
  const outward = (a: Point, b: Point) => Math.atan2(-(b.x - a.x), b.y - a.y);
  const pts: Point[] = [];
  for (let i = 0; i < sides; i += 1) {
    const prev = verts[(i - 1 + sides) % sides];
    const cur = verts[i];
    const next = verts[(i + 1) % sides];
    const a0 = outward(prev, cur);
    let d = outward(cur, next) - a0;
    while (d > Math.PI) d -= TAU;
    while (d < -Math.PI) d += TAU;
    for (let k = 0; k <= arcSteps; k += 1) {
      const a = a0 + (d * k) / arcSteps;
      pts.push({ x: cur.x + Math.cos(a) * rc, y: cur.y + Math.sin(a) * rc });
    }
  }
  return profileFromPolygon(pts);
}

/** Edge distance in any direction, interpolating between samples. */
export function radiusAtAngle(profile: Profile, angle: number): number {
  const t = ((((angle / TAU) % 1) + 1) % 1) * SAMPLES;
  const i = Math.floor(t);
  const a = profile[i % SAMPLES];
  const b = profile[(i + 1) % SAMPLES];
  return a + (b - a) * (t - i);
}

/** Positive degrees turn clockwise on screen. */
export function rotateProfile(profile: Profile, degrees: number): number[] {
  const rot = (degrees * Math.PI) / 180;
  return ANGLES.map((angle) => radiusAtAngle(profile, angle - rot));
}

/** Scales so the furthest point sits at `peak`, so shapes weigh the same to the eye. */
export function normalizeProfile(profile: Profile, peak = 1): number[] {
  const max = Math.max(...profile);
  return profile.map((r) => (r * peak) / max);
}

/** Closed Catmull-Rom path through the profile, centred on the origin. */
export function profilePath(profile: Profile, scale: number): string {
  const pts = profile.map((r, i) => ({ x: r * COS[i] * scale, y: r * SIN[i] * scale }));
  const n = pts.length;
  const tension = 1 / 6;
  let d = `M${r2(pts[0].x)} ${r2(pts[0].y)}`;
  for (let i = 0; i < n; i += 1) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    const c1x = p1.x + (p2.x - p0.x) * tension;
    const c1y = p1.y + (p2.y - p0.y) * tension;
    const c2x = p2.x - (p3.x - p1.x) * tension;
    const c2y = p2.y - (p3.y - p1.y) * tension;
    d += `C${r2(c1x)} ${r2(c1y)} ${r2(c2x)} ${r2(c2y)} ${r2(p2.x)} ${r2(p2.y)}`;
  }
  return `${d}Z`;
}

/** A stadium centred on the origin: the shape of one eye. */
export function capsulePath(w: number, h: number): string {
  const hw = w / 2;
  const hh = h / 2;
  const r = Math.min(hw, hh);
  return (
    `M${r2(-hw)} ${r2(-hh + r)}` +
    `A${r2(r)} ${r2(r)} 0 0 1 ${r2(-hw + r)} ${r2(-hh)}` +
    `L${r2(hw - r)} ${r2(-hh)}` +
    `A${r2(r)} ${r2(r)} 0 0 1 ${r2(hw)} ${r2(-hh + r)}` +
    `L${r2(hw)} ${r2(hh - r)}` +
    `A${r2(r)} ${r2(r)} 0 0 1 ${r2(hw - r)} ${r2(hh)}` +
    `L${r2(-hw + r)} ${r2(hh)}` +
    `A${r2(r)} ${r2(r)} 0 0 1 ${r2(-hw)} ${r2(hh - r)}Z`
  );
}

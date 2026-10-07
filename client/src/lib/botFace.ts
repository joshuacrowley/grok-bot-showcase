import { type Profile, capsulePath, radiusAtAngle } from './botGeometry';

/**
 * The eyes are painted on a sphere and the head turns, rather than two flat
 * slits sliding around. That is what gives them the lean, and the far eye its
 * narrower, depth-compressed look.
 *
 * The constants are bloub's, fitted to frames of the reference avatar
 * (https://github.com/jeremy-prt/bloub, MIT, Copyright (c) 2026 Jérémy Perret).
 * Rounding them to tidier values loses the resemblance.
 */

type Vec3 = [number, number, number];

export interface HeadGaze {
  /** Degrees, positive looks right. */
  yaw: number;
  /** Degrees, positive looks up. */
  pitch: number;
  /** Degrees, the tilt of the head. */
  roll: number;
}

/** Half the angle between the eyes on the sphere. */
const EYE_SPLIT = 15.46;
/** Eye size at rest, in body radii. */
const EYE_W = 0.186;
const EYE_H = 0.412;

/** The resting pose: looking up and to the right, head tipped so the eyes lean like `\\`. */
export const REST_GAZE: HeadGaze = { yaw: 28.49, pitch: 28.62, roll: -13 };

/** Centred on the origin; placed by the matrix from `eyeFrames`. */
export function eyePath(scale: number): string {
  return capsulePath(EYE_W * scale, EYE_H * scale);
}

export interface EyeFrame {
  /** An SVG `matrix(...)` transform. */
  transform: string;
  opacity: number;
}

/** Clearance between an eye and the body's edge, in body radii, before it reads as cramped. */
const EYE_GAP = 0.14;

const deg = (d: number) => (d * Math.PI) / 180;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

function spin(u: Vec3, v: Vec3, angle: number): [Vec3, Vec3] {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [
    [u[0] * c + v[0] * s, u[1] * c + v[1] * s, u[2] * c + v[2] * s],
    [v[0] * c - u[0] * s, v[1] * c - u[1] * s, v[2] * c - u[2] * s],
  ];
}

interface EyePose {
  /** Centre, in body radii, before any inset. */
  x: number;
  y: number;
  /** Columns of the tangent frame: the eye's own x and y axes on screen. */
  ax: number;
  ay: number;
  bx: number;
  by: number;
  depth: number;
}

function eyePoses(profile: Profile, gaze: HeadGaze): [EyePose, EyePose] {
  let forward: Vec3 = [0, 0, 1];
  let right: Vec3 = [1, 0, 0];
  let down: Vec3 = [0, 1, 0];
  [forward, right] = spin(forward, right, deg(gaze.yaw));
  [down, forward] = spin(down, forward, deg(gaze.pitch));
  [right, down] = spin(right, down, deg(gaze.roll));

  const build = (side: number): EyePose => {
    const [ef, er] = spin(forward, right, deg(EYE_SPLIT * side));
    // On anything but a circle, follow the body's real edge in that direction.
    const fit = radiusAtAngle(profile, Math.atan2(ef[1], ef[0]));
    return {
      x: ef[0] * fit,
      y: ef[1] * fit,
      ax: er[0],
      ay: er[1],
      bx: down[0],
      by: down[1],
      depth: ef[2],
    };
  };
  return [build(-1), build(1)];
}

const insets = new WeakMap<Profile, number>();

/**
 * Narrow shapes leave no room for the eyes where the sphere puts them: on a pill
 * they would sit on the rim. Measured once per shape at the resting pose, this
 * is how far toward the middle both eyes must come for their outlines to clear
 * the edge.
 */
function eyeInset(profile: Profile): number {
  const cached = insets.get(profile);
  if (cached !== undefined) return cached;

  const inside = (x: number, y: number) =>
    Math.hypot(x, y) <= radiusAtAngle(profile, Math.atan2(y, x));
  const poses = eyePoses(profile, REST_GAZE);
  // A ray test alone is lenient near flat edges, so each outline point must keep
  // a ring of clearance around it.
  const fits = (k: number) =>
    poses.every((pose) => {
      for (let i = 0; i < 16; i += 1) {
        const a = (i / 16) * Math.PI * 2;
        const u = (Math.cos(a) * EYE_W) / 2;
        const v = (Math.sin(a) * EYE_H) / 2;
        const px = pose.x * k + pose.ax * u + pose.bx * v;
        const py = pose.y * k + pose.ay * u + pose.by * v;
        for (let j = 0; j < 8; j += 1) {
          const b = (j / 8) * Math.PI * 2;
          if (!inside(px + Math.cos(b) * EYE_GAP, py + Math.sin(b) * EYE_GAP)) return false;
        }
      }
      return true;
    });

  let k = 1;
  while (k > 0.3 && !fits(k)) k -= 0.02;
  insets.set(profile, k);
  return k;
}

/**
 * Both eyes for a head pose. `lid` is 1 open, 0 shut; a blink squashes the eye
 * vertically on screen rather than along its own leaning axis.
 */
export function eyeFrames(
  profile: Profile,
  gaze: HeadGaze,
  lid: number,
  scale: number,
): [EyeFrame, EyeFrame] {
  const squash = 0.06 + 0.94 * Math.max(0, Math.min(1, lid));
  const k = eyeInset(profile) * scale;

  return eyePoses(profile, gaze).map((pose): EyeFrame => {
    if (pose.depth <= 0.02) return { transform: 'scale(0)', opacity: 0 };
    return {
      transform:
        `matrix(${r3(pose.ax)},${r3(pose.ay * squash)},${r3(pose.bx)},` +
        `${r3(pose.by * squash)},${r3(pose.x * k)},${r3(pose.y * k)})`,
      opacity: Math.min(1, pose.depth / 0.12),
    };
  }) as [EyeFrame, EyeFrame];
}

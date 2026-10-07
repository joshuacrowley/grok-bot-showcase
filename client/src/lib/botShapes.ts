import { type Shape } from './appearance';
import {
  type Profile,
  circleProfile,
  harmonicProfile,
  hullOfCirclesProfile,
  normalizeProfile,
  polarProfile,
  profilePath,
  rotateProfile,
  roundedPolygonProfile,
  superellipseProfile,
  unionOfCirclesProfile,
} from './botGeometry';

/**
 * The silhouettes, in body radii. Each is normalised by its furthest point; the
 * peaks differ because a squircle or a star measured that way looks smaller than
 * a circle of the same reach.
 */
function ring(
  count: number,
  offset: number,
  radii: readonly number[],
  startDeg: number,
): Array<{ x: number; y: number; r: number }> {
  return Array.from({ length: count }, (_, i) => {
    const a = ((startDeg + (360 / count) * i) * Math.PI) / 180;
    return { x: Math.cos(a) * offset, y: Math.sin(a) * offset, r: radii[i % radii.length] };
  });
}

/** Four plump points: a raised cosine sharpened by the exponent, on a round core. */
const STAR = polarProfile((a) => 0.84 + 0.34 * ((1 + Math.cos(4 * a)) / 2) ** 1.5);

export const SHAPE_PROFILE: Record<Shape, Profile> = {
  circle: circleProfile(),
  cloud: normalizeProfile(
    unionOfCirclesProfile([
      { x: -0.44, y: 0.2, r: 0.54 },
      { x: 0.46, y: 0.2, r: 0.5 },
      { x: 0.02, y: 0.3, r: 0.6 },
      { x: -0.24, y: -0.3, r: 0.48 },
      { x: 0.3, y: -0.24, r: 0.44 },
    ]),
    1.04,
  ),
  squircle: rotateProfile(normalizeProfile(superellipseProfile(4.2), 1.12), -14),
  star: rotateProfile(normalizeProfile(STAR, 1.16), 10),
  clover: normalizeProfile(
    unionOfCirclesProfile([{ x: 0, y: 0, r: 0.62 }, ...ring(4, 0.44, [0.56, 0.5, 0.58, 0.52], 35)]),
    1.06,
  ),
  egg: normalizeProfile(
    harmonicProfile([
      [2, 0.08, 0.5],
      [3, 0.085, 2.1],
    ]),
    1.04,
  ),
  flower: normalizeProfile(
    unionOfCirclesProfile([{ x: 0, y: 0, r: 0.76 }, ...ring(8, 0.7, [0.32], 8)]),
    1.08,
  ),
  droplet: rotateProfile(
    normalizeProfile(hullOfCirclesProfile(0, 0.22, 0.7, 0, -0.74, 0.16), 1.06),
    -40,
  ),
  pill: hullOfCirclesProfile(-0.42, 0, 0.62, 0.42, 0, 0.62),
  triangle: roundedPolygonProfile(3, 1.14, 0.34, -102),
  pentagon: roundedPolygonProfile(5, 1.08, 0.3, -78),
  splat: normalizeProfile(
    unionOfCirclesProfile([
      { x: 0, y: 0, r: 0.6 },
      ...ring(6, 0.64, [0.4, 0.31, 0.42, 0.33, 0.38, 0.3], -20),
    ]),
    1.1,
  ),
  hexagon: roundedPolygonProfile(6, 1.06, 0.28, 15),
};

const PATHS = new Map<string, string>();

/** Body outlines are pure functions of shape and scale, so each is built once. */
export function bodyPath(shape: Shape, scale: number): string {
  const key = `${shape}:${scale}`;
  let d = PATHS.get(key);
  if (!d) {
    d = profilePath(SHAPE_PROFILE[shape], scale);
    PATHS.set(key, d);
  }
  return d;
}

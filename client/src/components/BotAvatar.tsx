import React, { useEffect, useRef } from 'react';
import {
  COLOR_HEX,
  type Color,
  type Shape,
  safeColor,
  safeShape,
} from '../lib/appearance';
import { registerEyes } from '../lib/eyes';

/**
 * Where the eyes sit for each shape. The visual centre is not the geometric
 * centre for the pointed shapes, so each one carries its own offset.
 */
const EYE_CENTER: Record<Shape, [number, number]> = {
  circle: [32, 32],
  egg: [32, 34],
  squircle: [32, 32],
  pill: [32, 32],
  triangle: [32, 39],
  hexagon: [32, 32],
  cloud: [32, 36],
  droplet: [32, 39],
};

/**
 * Bodies are drawn with a matching stroke and round joins, which rounds the
 * corners of the angular shapes without hand-writing arc paths.
 */
const BODY: Record<Shape, (fill: string) => React.ReactNode> = {
  circle: (fill) => <circle cx="32" cy="32" r="24" fill={fill} />,
  egg: (fill) => (
    <path
      d="M32 6C20.5 6 12 19 12 33.5C12 47 20.5 58 32 58C43.5 58 52 47 52 33.5C52 19 43.5 6 32 6Z"
      fill={fill}
    />
  ),
  squircle: (fill) => <rect x="8" y="8" width="48" height="48" rx="15" fill={fill} />,
  pill: (fill) => <rect x="5" y="16" width="54" height="32" rx="16" fill={fill} />,
  triangle: (fill) => (
    <path
      d="M32 13L54 51H10L32 13Z"
      fill={fill}
      stroke={fill}
      strokeWidth="9"
      strokeLinejoin="round"
    />
  ),
  hexagon: (fill) => (
    <path
      d="M32 9L52 20.5V43.5L32 55L12 43.5V20.5L32 9Z"
      fill={fill}
      stroke={fill}
      strokeWidth="7"
      strokeLinejoin="round"
    />
  ),
  cloud: (fill) => (
    <g fill={fill}>
      <circle cx="19" cy="38" r="13" />
      <circle cx="31" cy="25" r="15" />
      <circle cx="45" cy="36" r="13" />
      <circle cx="32" cy="43" r="15" />
    </g>
  ),
  droplet: (fill) => (
    <path
      d="M32 5C32 5 52 27 52 39C52 50 43 58 32 58C21 58 12 50 12 39C12 27 32 5 32 5Z"
      fill={fill}
    />
  ),
};

interface BotAvatarProps {
  color: string;
  shape: string;
  /** Rendered pixel size. The artwork is a 64-unit square. */
  size?: number;
  className?: string;
  /** Set false for decorative copies that should hold still, like the favicon-ish brand mark. */
  animated?: boolean;
}

export const BotAvatar: React.FC<BotAvatarProps> = ({
  color,
  shape,
  size = 48,
  className,
  animated = true,
}) => {
  const resolvedColor: Color = safeColor(color);
  const resolvedShape: Shape = safeShape(shape);
  const fill = COLOR_HEX[resolvedColor];
  const [cx, cy] = EYE_CENTER[resolvedShape];
  const eyesRef = useRef<SVGGElement>(null);

  useEffect(() => {
    if (!animated || !eyesRef.current) return;
    return registerEyes(eyesRef.current, cx, cy);
  }, [animated, cx, cy]);

  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      role="img"
      aria-hidden="true"
    >
      {BODY[resolvedShape](fill)}
      <g ref={eyesRef}>
        <rect x={cx - 8.5} y={cy - 6} width="5" height="12" rx="2.5" fill="#ffffff" />
        <rect x={cx + 3.5} y={cy - 6} width="5" height="12" rx="2.5" fill="#ffffff" />
      </g>
    </svg>
  );
};

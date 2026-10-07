import React, { useEffect, useId, useMemo, useRef } from 'react';
import { COLOR_HEX, safeColor, safeShape } from '../lib/appearance';
import { REST_GAZE, eyeFrames, eyePath } from '../lib/botFace';
import { SHAPE_PROFILE, bodyPath } from '../lib/botShapes';
import { type LookSource, registerEyes } from '../lib/eyes';

/** Body radius in viewBox units. The widest shapes reach about 1.16 of it. */
const RADIUS = 25;
const VIEWBOX = 64;
const EYE_PATH = eyePath(RADIUS);

interface BotAvatarProps {
  color: string;
  shape: string;
  /** Rendered pixel size. */
  size?: number;
  className?: string;
  /** Set false for decorative copies that should hold still, like the tiny ticker icons. */
  animated?: boolean;
  /** Steers where this bot looks; see `LookSource`. Must keep the same identity across renders. */
  lookAt?: LookSource;
  /** For avatars that move on their own, so their gaze is aimed from where they are now. */
  live?: boolean;
}

export const BotAvatar: React.FC<BotAvatarProps> = ({
  color,
  shape,
  size = 48,
  className,
  animated = true,
  lookAt,
  live = false,
}) => {
  const resolvedShape = safeShape(shape);
  const fill = COLOR_HEX[safeColor(color)];
  const profile = SHAPE_PROFILE[resolvedShape];
  const body = bodyPath(resolvedShape, RADIUS);
  const rest = useMemo(() => eyeFrames(profile, REST_GAZE, 1, RADIUS), [profile]);
  // useId can contain characters that are not safe inside url(#...).
  const clipId = `bot-clip-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const innerRef = useRef<SVGPathElement>(null);
  const outerRef = useRef<SVGPathElement>(null);

  useEffect(() => {
    if (!animated || !innerRef.current || !outerRef.current) return;
    return registerEyes({
      eyes: [innerRef.current, outerRef.current],
      profile,
      scale: RADIUS,
      lookAt,
      live,
    });
  }, [animated, profile, lookAt, live]);

  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox={`${-VIEWBOX / 2} ${-VIEWBOX / 2} ${VIEWBOX} ${VIEWBOX}`}
      fill="none"
      role="img"
      aria-hidden="true"
    >
      <defs>
        <clipPath id={clipId}>
          <path d={body} />
        </clipPath>
      </defs>
      <path d={body} fill={fill} />
      <g clipPath={`url(#${clipId})`} fill="#ffffff">
        <path ref={innerRef} d={EYE_PATH} transform={rest[0].transform} opacity={rest[0].opacity} />
        <path ref={outerRef} d={EYE_PATH} transform={rest[1].transform} opacity={rest[1].opacity} />
      </g>
    </svg>
  );
};

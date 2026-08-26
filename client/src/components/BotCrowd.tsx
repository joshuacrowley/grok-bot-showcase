import React from 'react';
import { type Color, type Shape } from '../lib/appearance';
import { BotAvatar } from './BotAvatar';

interface CrowdMember {
  color: Color;
  shape: Shape;
  size: number;
  /** Position within the crowd box, in percent, measured from the top left. */
  x: number;
  y: number;
}

/**
 * Decoration, not data. A loose cluster covering every shape, so the empty
 * showcase still has something watching you and the eyes are visible at a size
 * where the blink actually reads.
 */
const CROWD: CrowdMember[] = [
  { color: 'slate', shape: 'pill', size: 42, x: 16, y: 8 },
  { color: 'blue', shape: 'circle', size: 92, x: 46, y: 24 },
  { color: 'pink', shape: 'cloud', size: 48, x: 78, y: 12 },
  { color: 'amber', shape: 'squircle', size: 66, x: 14, y: 40 },
  { color: 'purple', shape: 'droplet', size: 72, x: 80, y: 46 },
  { color: 'green', shape: 'egg', size: 58, x: 46, y: 66 },
  { color: 'teal', shape: 'hexagon', size: 54, x: 12, y: 74 },
  { color: 'red', shape: 'triangle', size: 50, x: 76, y: 80 },
];

export const BotCrowd: React.FC = () => (
  <div className="bot-crowd" aria-hidden="true">
    {CROWD.map((member) => (
      <span
        key={`${member.color}-${member.shape}`}
        className="bot-crowd-member"
        style={{ left: `${member.x}%`, top: `${member.y}%` }}
      >
        <BotAvatar color={member.color} shape={member.shape} size={member.size} />
      </span>
    ))}
  </div>
);

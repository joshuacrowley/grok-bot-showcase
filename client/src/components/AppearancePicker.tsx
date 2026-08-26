import React from 'react';
import {
  COLORS,
  COLOR_HEX,
  COLOR_LABEL,
  SHAPES,
  SHAPE_LABEL,
  type Color,
  type Shape,
} from '../lib/appearance';
import { BotAvatar } from './BotAvatar';

interface AppearancePickerProps {
  color: Color;
  shape: Shape;
  onColorChange: (color: Color) => void;
  onShapeChange: (shape: Shape) => void;
}

export const AppearancePicker: React.FC<AppearancePickerProps> = ({
  color,
  shape,
  onColorChange,
  onShapeChange,
}) => (
  <div className="picker">
    <div className="picker-preview">
      <BotAvatar color={color} shape={shape} size={76} />
      <span className="picker-preview-label">
        {COLOR_LABEL[color]} {SHAPE_LABEL[shape].toLowerCase()}
      </span>
    </div>

    <div className="picker-groups">
      <div>
        <p className="picker-group-label">Shape</p>
        <div className="shape-options">
          {SHAPES.map((option) => (
            <button
              key={option}
              type="button"
              className="shape-option"
              aria-pressed={shape === option}
              aria-label={SHAPE_LABEL[option]}
              title={SHAPE_LABEL[option]}
              onClick={() => onShapeChange(option)}
            >
              <BotAvatar color={color} shape={option} size={38} />
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="picker-group-label">Colour</p>
        <div className="color-options">
          {COLORS.map((option) => (
            <button
              key={option}
              type="button"
              className="color-option"
              aria-pressed={color === option}
              aria-label={COLOR_LABEL[option]}
              title={COLOR_LABEL[option]}
              onClick={() => onColorChange(option)}
            >
              <span className="color-swatch" style={{ background: COLOR_HEX[option] }} />
            </button>
          ))}
        </div>
      </div>
    </div>
  </div>
);

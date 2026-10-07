export const COLORS = [
  'slate', 'brown', 'red', 'orange', 'amber',
  'green', 'teal', 'blue', 'purple', 'pink', 'grey',
] as const;

export type Color = (typeof COLORS)[number];

export const SHAPES = [
  'circle', 'cloud', 'squircle', 'star', 'clover',
  'egg', 'flower', 'droplet', 'pill', 'triangle',
  'pentagon', 'splat', 'hexagon',
] as const;

export type Shape = (typeof SHAPES)[number];

export const COLOR_HEX: Record<Color, string> = {
  slate: '#2f3033',
  brown: '#96704a',
  red: '#e0504f',
  orange: '#e2712c',
  amber: '#eda93c',
  green: '#4bad6e',
  teal: '#4cc1ad',
  blue: '#3d82f5',
  purple: '#8f5cf6',
  pink: '#ec4a99',
  grey: '#8e9196',
};

export const COLOR_LABEL: Record<Color, string> = {
  slate: 'Slate',
  brown: 'Brown',
  red: 'Red',
  orange: 'Orange',
  amber: 'Amber',
  green: 'Green',
  teal: 'Teal',
  blue: 'Blue',
  purple: 'Purple',
  pink: 'Pink',
  grey: 'Grey',
};

export const SHAPE_LABEL: Record<Shape, string> = {
  circle: 'Circle',
  cloud: 'Cloud',
  squircle: 'Rounded square',
  star: 'Star',
  clover: 'Clover',
  egg: 'Pebble',
  flower: 'Flower',
  droplet: 'Droplet',
  pill: 'Pill',
  triangle: 'Triangle',
  pentagon: 'Pentagon',
  splat: 'Splat',
  hexagon: 'Hexagon',
};

export const DEFAULT_COLOR: Color = 'amber';
export const DEFAULT_SHAPE: Shape = 'squircle';

export function isColor(value: string): value is Color {
  return (COLORS as readonly string[]).includes(value);
}

export function isShape(value: string): value is Shape {
  return (SHAPES as readonly string[]).includes(value);
}

/** Falls back rather than throwing, so an unknown value from the API still renders. */
export function safeColor(value: string): Color {
  return isColor(value) ? value : DEFAULT_COLOR;
}

export function safeShape(value: string): Shape {
  return isShape(value) ? value : DEFAULT_SHAPE;
}

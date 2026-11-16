export const GROUP_COLORS = [
  'red',
  'orange',
  'amber',
  'green',
  'teal',
  'cyan',
  'blue',
  'indigo',
  'purple',
  'pink',
  'gray',
] as const;
export type GroupColor = (typeof GROUP_COLORS)[number];

export const COLOR_NAMES: Record<GroupColor, string> = {
  red: '红',
  orange: '橙',
  amber: '琥珀',
  green: '绿',
  teal: '青绿',
  cyan: '青',
  blue: '蓝',
  indigo: '靛蓝',
  purple: '紫',
  pink: '粉',
  gray: '灰',
};

const HEX = /^#[0-9a-fA-F]{6}$/;
export const isGroupColor = (value: string): boolean =>
  (GROUP_COLORS as readonly string[]).includes(value) || HEX.test(value);

/** The CSS colour for a stored colour: a preset follows the theme, a custom one is used as is. */
export const colorValue = (color: string): string =>
  HEX.test(color) ? color : `var(--lg-label-${isGroupColor(color) ? color : 'gray'})`;

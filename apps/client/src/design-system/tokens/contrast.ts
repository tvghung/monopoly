const HEX_PATTERN = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

function parseHex(hex: string): [number, number, number] {
  if (!HEX_PATTERN.test(hex)) throw new Error(`Expected a #RGB or #RRGGBB color, got "${hex}".`);
  const digits = hex.length === 4
    ? [...hex.slice(1)].map(digit => digit + digit).join('')
    : hex.slice(1);
  return [
    Number.parseInt(digits.slice(0, 2), 16),
    Number.parseInt(digits.slice(2, 4), 16),
    Number.parseInt(digits.slice(4, 6), 16),
  ];
}

function linearize(channel: number): number {
  const value = channel / 255;
  return value <= 0.039_28 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

/** WCAG 2.x relative luminance of an opaque sRGB hex color. */
export function relativeLuminance(hex: string): number {
  const [red, green, blue] = parseHex(hex);
  return 0.2126 * linearize(red) + 0.7152 * linearize(green) + 0.0722 * linearize(blue);
}

/** WCAG 2.x contrast ratio between two opaque sRGB hex colors (1 to 21). */
export function contrastRatio(first: string, second: string): number {
  const a = relativeLuminance(first);
  const b = relativeLuminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function toHex(channel: number): string {
  return Math.round(Math.min(255, Math.max(0, channel))).toString(16).padStart(2, '0');
}

/** Opaque mix of `foreground` over `background`; `amount` is the foreground share (0 to 1). */
export function mixHex(foreground: string, background: string, amount: number): string {
  const front = parseHex(foreground);
  const back = parseHex(background);
  const mixed = front.map((channel, index) => channel * amount + back[index] * (1 - amount));
  return `#${mixed.map(toHex).join('')}`;
}

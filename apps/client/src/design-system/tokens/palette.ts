/**
 * TypeScript mirror of `palette.css` (the `--otb-*` primitive palette of Visual Overhaul V2).
 * The DOM reads the CSS variables; WebGL scene code reads this map so both share one source.
 * `palette.test.ts` fails when the two drift apart.
 */
export const OTB_PALETTE = {
  'paper-50': '#FFFBF3',
  'paper-100': '#FBF3E4',
  'paper-200': '#F2E4CC',
  'paper-300': '#E6D2B2',
  'ink-900': '#2B1D14',
  'ink-700': '#5A4636',
  'ink-500': '#7A6553',
  'ink-alpha-12': 'rgb(43 29 20 / 12%)',
  'lacquer-600': '#C4302B',
  'lacquer-700': '#A32520',
  'lacquer-100': '#FBE3DF',
  'gold-400': '#F2B632',
  'gold-700': '#8C6200',
  'gold-100': '#FDF0CF',
  'jade-600': '#177A63',
  'jade-700': '#0F5E4C',
  'jade-100': '#DDF3EC',
  'blue-600': '#1F4E9C',
  'blue-100': '#E1EAF8',
  'gain-600': '#1E7F3C',
  'gain-700': '#166B31',
  'gain-100': '#DDF3E3',
  'warn-400': '#FFB020',
  'warn-700': '#8A4F00',
  'warn-100': '#FFF0CC',
  white: '#FFFFFF',
  'table-oak': '#DDBB8F',
  'table-oak-dark': '#B08A5F',
  backdrop: '#F4E6D0',
} as const;

export type OtbPaletteKey = keyof typeof OTB_PALETTE;

/** Name of the CSS custom property that carries a palette entry. */
export function otbVariable(key: OtbPaletteKey): `--otb-${OtbPaletteKey}` {
  return `--otb-${key}`;
}

export type ContrastUse = 'text-aaa' | 'text-aa' | 'large-text' | 'non-text';

/** Minimum contrast ratio each use has to reach (WCAG 2.x). */
export const CONTRAST_MINIMUM: Record<ContrastUse, number> = {
  'text-aaa': 7,
  'text-aa': 4.5,
  'large-text': 3,
  'non-text': 3,
};

export interface ContrastRequirement {
  foreground: OtbPaletteKey;
  background: OtbPaletteKey;
  use: ContrastUse;
  /** Contrast ratio recorded when the palette was verified (plan 01 §8.2), rounded to 2 decimals. */
  recorded: number;
}

const pair = (
  foreground: OtbPaletteKey,
  background: OtbPaletteKey,
  use: ContrastUse,
  recorded: number,
): ContrastRequirement => ({
  foreground, background, use, recorded,
});

/** Verified foreground/background pairs of plan 01 §8.2. Only these pairs may carry text. */
export const CONTRAST_REQUIREMENTS: readonly ContrastRequirement[] = [
  pair('ink-900', 'paper-50', 'text-aaa', 15.79),
  pair('ink-900', 'paper-100', 'text-aaa', 14.78),
  pair('ink-700', 'paper-50', 'text-aaa', 8.61),
  pair('ink-700', 'paper-100', 'text-aaa', 8.05),
  pair('ink-700', 'paper-200', 'text-aaa', 7.08),
  pair('ink-500', 'paper-50', 'text-aa', 5.33),
  pair('ink-500', 'paper-100', 'text-aa', 4.99),
  pair('ink-500', 'white', 'text-aa', 5.51),
  // Muted text on paper-200 is large text only.
  pair('ink-500', 'paper-200', 'large-text', 4.39),
  pair('white', 'lacquer-600', 'text-aa', 5.52),
  pair('white', 'lacquer-700', 'text-aaa', 7.39),
  pair('lacquer-700', 'lacquer-100', 'text-aa', 6.03),
  pair('ink-900', 'gold-400', 'text-aaa', 8.93),
  pair('ink-900', 'gold-100', 'text-aaa', 14.39),
  pair('gold-700', 'paper-50', 'text-aa', 5.27),
  pair('gold-700', 'gold-100', 'text-aa', 4.8),
  pair('white', 'jade-600', 'text-aa', 5.25),
  pair('white', 'jade-700', 'text-aaa', 7.7),
  pair('jade-700', 'jade-100', 'text-aa', 6.64),
  pair('white', 'blue-600', 'text-aaa', 7.99),
  pair('blue-600', 'blue-100', 'text-aa', 6.59),
  pair('gain-600', 'paper-50', 'text-aa', 4.9),
  pair('gain-600', 'paper-100', 'text-aa', 4.58),
  pair('gain-700', 'gain-100', 'text-aa', 5.66),
  pair('lacquer-600', 'paper-50', 'text-aa', 5.35),
  pair('lacquer-600', 'paper-100', 'text-aa', 5),
  pair('warn-700', 'paper-50', 'text-aa', 6.36),
  pair('warn-700', 'warn-100', 'text-aa', 5.81),
  pair('ink-900', 'warn-400', 'text-aaa', 8.91),
  pair('blue-600', 'paper-50', 'non-text', 7.74),
  pair('blue-600', 'table-oak', 'non-text', 4.41),
  pair('ink-900', 'table-oak', 'text-aaa', 8.99),
];

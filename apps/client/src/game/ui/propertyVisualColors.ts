import { contrastRatio, mixHex } from '../../design-system/tokens/contrast';
import { OTB_PALETTE } from '../../design-system/tokens/palette';

export type PropertyMotif =
  'brick' | 'water' | 'shopping' | 'market' | 'downtown' | 'nightlife' | 'eco' | 'luxury' | 'rail' | 'utility';

export type VisualTheme = 'v1' | 'v2';

export interface PropertyGroupVisualStyle {
  color: string;
  tint: string;
  /** Text color that reaches at least 4.5:1 on `color`; consumers never guess it. */
  headerText: string;
  motif: PropertyMotif;
  label: string;
}

type StyleSeed = Omit<PropertyGroupVisualStyle, 'headerText'> & { headerText?: string };

const V1_TEXT = '#123244';
const WHITE = '#ffffff';

function bestHeaderText(color: string): string {
  return contrastRatio(color, WHITE) >= contrastRatio(color, V1_TEXT) ? WHITE : V1_TEXT;
}

function withHeaderText(styles: Record<string, StyleSeed>): Record<string, PropertyGroupVisualStyle> {
  return Object.fromEntries(Object.entries(styles).map(([key, style]) => [
    key,
    { ...style, headerText: style.headerText ?? bestHeaderText(style.color) },
  ]));
}

const PROPERTY_GROUP_VISUAL_STYLES_V1 = withHeaderText({
  brown: { color: '#a8522f', tint: '#fff0e7', motif: 'brick', label: 'Nhóm Nâu' },
  lightblue: { color: '#00a8d4', tint: '#e5f8fd', motif: 'water', label: 'Nhóm Xanh nhạt' },
  pink: { color: '#e83db0', tint: '#ffe4f5', motif: 'shopping', label: 'Nhóm Hồng' },
  orange: { color: '#f16b1f', tint: '#fff0df', motif: 'market', label: 'Nhóm Cam' },
  red: { color: '#e5394f', tint: '#ffe4e6', motif: 'downtown', label: 'Nhóm Đỏ' },
  yellow: { color: '#f2b300', tint: '#fff7cc', motif: 'nightlife', label: 'Nhóm Vàng' },
  green: { color: '#00a96b', tint: '#e4f8ea', motif: 'eco', label: 'Nhóm Xanh lá' },
  blue: { color: '#4a63d9', tint: '#e9ecff', motif: 'luxury', label: 'Nhóm Xanh dương' },
  railroad: { color: '#426486', tint: '#eef3f8', motif: 'rail', label: 'Ga tàu' },
});

/** V2 district table (plan 01 §8.4). Tints are 14% mixes of the color over paper-50. */
const V2_TINT_SHARE = 0.14;
const v2Style = (
  color: string,
  headerText: string,
  motif: PropertyMotif,
  label: string,
): StyleSeed => ({
  color,
  tint: mixHex(color, OTB_PALETTE['paper-50'], V2_TINT_SHARE),
  headerText,
  motif,
  label,
});

const INK = OTB_PALETTE['ink-900'];
const PROPERTY_GROUP_VISUAL_STYLES_V2 = withHeaderText({
  brown: v2Style('#8D5B3E', WHITE, 'brick', 'Nhóm Nâu'),
  lightblue: v2Style('#6EC3E8', INK, 'water', 'Nhóm Xanh nhạt'),
  pink: v2Style('#E97BAA', INK, 'shopping', 'Nhóm Hồng'),
  orange: v2Style('#F2913A', INK, 'market', 'Nhóm Cam'),
  red: v2Style('#C9402F', WHITE, 'downtown', 'Nhóm Đỏ'),
  yellow: v2Style('#F2C230', INK, 'nightlife', 'Nhóm Vàng'),
  green: v2Style('#3FA35B', INK, 'eco', 'Nhóm Xanh lá'),
  blue: v2Style('#2F5FB8', WHITE, 'luxury', 'Nhóm Xanh dương'),
  railroad: v2Style('#3D3A36', WHITE, 'rail', 'Ga tàu'),
  utility: v2Style('#7C8A93', INK, 'utility', 'Tiện ích'),
});

const FALLBACK_STYLE: PropertyGroupVisualStyle = {
  color: '#00a892',
  tint: '#edf9f6',
  headerText: bestHeaderText('#00a892'),
  motif: 'water',
  label: 'Tài sản',
};

const FALLBACK_STYLE_V2: PropertyGroupVisualStyle = {
  color: '#7C8A93',
  tint: mixHex('#7C8A93', OTB_PALETTE['paper-50'], V2_TINT_SHARE),
  headerText: INK,
  motif: 'utility',
  label: 'Tài sản',
};

/** Reads the active visual theme from `<html data-visual-theme>`; anything but `v2` is v1. */
export function readDocumentVisualTheme(): VisualTheme {
  if (typeof document === 'undefined') return 'v1';
  return document.documentElement.dataset.visualTheme === 'v2' ? 'v2' : 'v1';
}

export function getPropertyGroupVisualStyle(
  rawColor: string | null | undefined,
  theme: VisualTheme = readDocumentVisualTheme(),
): PropertyGroupVisualStyle {
  const table = theme === 'v2' ? PROPERTY_GROUP_VISUAL_STYLES_V2 : PROPERTY_GROUP_VISUAL_STYLES_V1;
  const fallback = theme === 'v2' ? FALLBACK_STYLE_V2 : FALLBACK_STYLE;
  if (!rawColor) return fallback;
  return table[rawColor.toLowerCase()] ?? fallback;
}

export function getPropertyGroupDisplayColor(
  rawColor: string | null | undefined,
  theme: VisualTheme = readDocumentVisualTheme(),
): string {
  return getPropertyGroupVisualStyle(rawColor, theme).color;
}

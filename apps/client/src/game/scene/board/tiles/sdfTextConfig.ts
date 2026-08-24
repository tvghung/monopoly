import { boardVisualTokens } from '../boardVisualTokens';
import { BOARD_FONT_URL } from '../../../../design-system/typography/gameFonts';

export const TILE_SDF_GLYPH_SIZE = 64;

export interface SdfTextTarget {
  text: string;
  font: string | null;
  fontSize: number;
  maxWidth: number;
  maxHeight: number;
  anchorX: number | string;
  anchorY: number | string;
  textAlign: string;
  lineHeight: number | string;
  whiteSpace?: string;
  overflowWrap?: string;
  color: string | number;
  outlineColor?: string | number;
  outlineWidth?: number | string;
  outlineOpacity?: number;
  sdfGlyphSize: number;
  sync: (callback?: () => void) => void;
}

export interface SdfTextConfig {
  value: string;
  fontSize: number;
  maxWidth: number;
  maxHeight?: number;
  color?: string;
  outlineColor?: string | number;
  outlineWidth?: number | string;
  outlineOpacity?: number;
  lineHeight?: number;
  whiteSpace?: 'normal' | 'nowrap';
  overflowWrap?: 'normal' | 'break-word';
  sdfGlyphSize?: number;
}

export function configureSdfText(
  text: SdfTextTarget,
  props: SdfTextConfig,
  onSync?: () => void,
): void {
  text.text = props.value;
  text.font = BOARD_FONT_URL;
  text.fontSize = props.fontSize;
  text.maxWidth = props.maxWidth;
  text.maxHeight = props.maxHeight ?? props.fontSize * 3.4;
  text.anchorX = 'center';
  text.anchorY = 'middle';
  text.textAlign = 'center';
  text.lineHeight = props.lineHeight ?? 1.05;
  text.whiteSpace = props.whiteSpace ?? 'normal';
  text.overflowWrap = props.overflowWrap ?? 'normal';
  text.color = props.color ?? boardVisualTokens.tileText;
  text.outlineColor = props.outlineColor ?? '#000000';
  text.outlineWidth = props.outlineWidth ?? 0;
  text.outlineOpacity = props.outlineOpacity ?? 0;
  text.sdfGlyphSize = props.sdfGlyphSize ?? TILE_SDF_GLYPH_SIZE;
  text.sync(onSync);
}

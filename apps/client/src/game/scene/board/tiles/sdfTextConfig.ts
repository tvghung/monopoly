import beVietnamProFont from '@fontsource/be-vietnam-pro/files/be-vietnam-pro-vietnamese-700-normal.woff?url';
import { boardVisualTokens } from '../boardVisualTokens';

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
  color: string | number;
  sdfGlyphSize: number;
  sync: () => void;
}

export interface SdfTextConfig {
  value: string;
  fontSize: number;
  maxWidth: number;
  color?: string;
  lineHeight?: number;
  sdfGlyphSize?: number;
}

export function configureSdfText(text: SdfTextTarget, props: SdfTextConfig): void {
  text.text = props.value;
  text.font = beVietnamProFont;
  text.fontSize = props.fontSize;
  text.maxWidth = props.maxWidth;
  text.maxHeight = props.fontSize * 3.4;
  text.anchorX = 'center';
  text.anchorY = 'middle';
  text.textAlign = 'center';
  text.lineHeight = props.lineHeight ?? 1.05;
  text.color = props.color ?? boardVisualTokens.tileText;
  text.sdfGlyphSize = props.sdfGlyphSize ?? TILE_SDF_GLYPH_SIZE;
  text.sync();
}

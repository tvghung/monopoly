import beVietnamProExtraBoldFont from './assets/BeVietnamPro-ExtraBold.ttf?url';

/**
 * A single, unsubsetted board font keeps Troika's one-file loader from
 * dropping ASCII or Vietnamese precomposed glyphs between separate subsets.
 */
export const BOARD_FONT_URL = beVietnamProExtraBoldFont;
export const BOARD_FONT_FAMILY = 'Be Vietnam Pro';
export const BOARD_FONT_WEIGHT = 800;

export const BOARD_FONT_GLYPH_SAMPLES = [
  'Cà Mau',
  'Buôn Ma Thuột',
  'Đà Nẵng',
  'Phú Quốc',
  'Công Ty Nước',
  'Khí vận',
  'Cơ hội',
] as const;

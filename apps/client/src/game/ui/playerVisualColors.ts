const PLAYER_DISPLAY_COLORS: Record<string, string> = {
  yellow: '#f2bb13',
  green: '#17a968',
  blue: '#416bd8',
  red: '#e54659',
  orange: '#ef7727',
  white: '#fff6dd',
  black: '#223746',
};

const PLAYER_DISPLAY_FOREGROUNDS: Record<string, string> = {
  yellow: '#183344',
  green: '#ffffff',
  blue: '#ffffff',
  red: '#ffffff',
  orange: '#ffffff',
  white: '#183344',
  black: '#ffffff',
};

const FALLBACK_DISPLAY_COLOR = '#11aaa4';

export function getPlayerDisplayColor(rawColor: string | null | undefined): string {
  if (!rawColor) return FALLBACK_DISPLAY_COLOR;
  return PLAYER_DISPLAY_COLORS[rawColor.toLowerCase()] ?? FALLBACK_DISPLAY_COLOR;
}

export function getPlayerDisplayForeground(rawColor: string | null | undefined): string {
  if (!rawColor) return '#ffffff';
  return PLAYER_DISPLAY_FOREGROUNDS[rawColor.toLowerCase()] ?? '#ffffff';
}

const PLAYER_DISPLAY_COLORS: Record<string, string> = {
  yellow: '#ffc400',
  green: '#00b86b',
  blue: '#3567f2',
  red: '#f2384a',
  orange: '#ff7a18',
  white: '#fff6dd',
  black: '#19313e',
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

const FALLBACK_DISPLAY_COLOR = '#00b9a5';

export function getPlayerDisplayColor(rawColor: string | null | undefined): string {
  if (!rawColor) return FALLBACK_DISPLAY_COLOR;
  return PLAYER_DISPLAY_COLORS[rawColor.toLowerCase()] ?? FALLBACK_DISPLAY_COLOR;
}

export function getPlayerDisplayForeground(rawColor: string | null | undefined): string {
  if (!rawColor) return '#ffffff';
  return PLAYER_DISPLAY_FOREGROUNDS[rawColor.toLowerCase()] ?? '#ffffff';
}

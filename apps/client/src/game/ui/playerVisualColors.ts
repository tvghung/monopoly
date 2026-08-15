const PLAYER_DISPLAY_COLORS: Record<string, string> = {
  yellow: '#eecb63',
  green: '#70c499',
  blue: '#7fa5e3',
  red: '#ec8792',
  orange: '#f0ab68',
  white: '#f5efe6',
  black: '#8b8fa8',
};

const PLAYER_DISPLAY_FOREGROUNDS: Record<string, string> = {
  yellow: '#5d4c1a',
  green: '#274f3c',
  blue: '#324d7b',
  red: '#6e3340',
  orange: '#704515',
  white: '#34454d',
  black: '#34454d',
};

const FALLBACK_DISPLAY_COLOR = '#72ccbc';

export function getPlayerDisplayColor(rawColor: string | null | undefined): string {
  if (!rawColor) return FALLBACK_DISPLAY_COLOR;
  return PLAYER_DISPLAY_COLORS[rawColor.toLowerCase()] ?? FALLBACK_DISPLAY_COLOR;
}

export function getPlayerDisplayForeground(rawColor: string | null | undefined): string {
  if (!rawColor) return '#34454d';
  return PLAYER_DISPLAY_FOREGROUNDS[rawColor.toLowerCase()] ?? '#34454d';
}


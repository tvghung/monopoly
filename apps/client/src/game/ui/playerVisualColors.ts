import {
  PLAYER_COLOR_IDS,
  type PlayerColorId,
} from '@monopoly/shared';

export interface PlayerColorVisual {
  label: string;
  display: string;
  foreground: string;
  accentDark: string;
}

export const PLAYER_COLOR_VISUALS: Record<PlayerColorId, PlayerColorVisual> = {
  red: { label: 'Đỏ', display: '#f2384a', foreground: '#ffffff', accentDark: '#bd2033' },
  blue: { label: 'Xanh dương', display: '#3567f2', foreground: '#ffffff', accentDark: '#2448b7' },
  green: { label: 'Xanh lá', display: '#00b86b', foreground: '#ffffff', accentDark: '#008451' },
  yellow: { label: 'Vàng', display: '#ffc400', foreground: '#183344', accentDark: '#c18f00' },
  orange: { label: 'Cam', display: '#ff7a18', foreground: '#ffffff', accentDark: '#c34f00' },
  purple: { label: 'Tím', display: '#8b5cf6', foreground: '#ffffff', accentDark: '#6740c7' },
  pink: { label: 'Hồng', display: '#ec4899', foreground: '#ffffff', accentDark: '#b52b70' },
  cyan: { label: 'Xanh cyan', display: '#06b6d4', foreground: '#183344', accentDark: '#04849b' },
  lime: { label: 'Xanh chanh', display: '#84cc16', foreground: '#183344', accentDark: '#5b8c0b' },
  charcoal: { label: 'Than chì', display: '#334155', foreground: '#ffffff', accentDark: '#1f2937' },
};

const FALLBACK_DISPLAY_COLOR = PLAYER_COLOR_VISUALS.cyan.display;

export function isPlayerColorId(rawColor: string | null | undefined): rawColor is PlayerColorId {
  return rawColor !== undefined
    && rawColor !== null
    && (PLAYER_COLOR_IDS as readonly string[]).includes(rawColor.toLowerCase());
}

function resolvePlayerColor(rawColor: string | null | undefined): PlayerColorVisual | null {
  if (!rawColor) return null;
  const normalized = rawColor.toLowerCase();
  return isPlayerColorId(normalized) ? PLAYER_COLOR_VISUALS[normalized] : null;
}

export function getPlayerDisplayColor(rawColor: string | null | undefined): string {
  return resolvePlayerColor(rawColor)?.display ?? FALLBACK_DISPLAY_COLOR;
}

export function getPlayerDisplayForeground(rawColor: string | null | undefined): string {
  return resolvePlayerColor(rawColor)?.foreground ?? '#ffffff';
}

export function getPlayerAccentDarkColor(rawColor: string | null | undefined): string {
  return resolvePlayerColor(rawColor)?.accentDark ?? PLAYER_COLOR_VISUALS.cyan.accentDark;
}

export function getPlayerColorLabel(rawColor: string | null | undefined): string {
  return resolvePlayerColor(rawColor)?.label ?? 'Màu người chơi';
}

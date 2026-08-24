import type { PlayerColorId } from '@monopoly/shared';
import {
  getPlayerAccentDarkColor,
  getPlayerDisplayColor,
} from '../ui/playerVisualColors';

export const PLAYER_ACCENT_PRIMARY_TOKEN = '#FF00FF';
export const PLAYER_ACCENT_DARK_TOKEN = '#CC00CC';

export function colorizeCharacterSvg(rawSvg: string, playerColor: PlayerColorId): string {
  if (!rawSvg.trimStart().startsWith('<svg')) {
    throw new Error('Character SVG must be a local SVG document');
  }
  if (/<script\b|(?:href|xlink:href|src)\s*=\s*["'][^"']*(?:https?:|\/\/|data:)/iu.test(rawSvg)) {
    throw new Error('Character SVG cannot contain scripts or external URLs');
  }
  return rawSvg
    .replaceAll(PLAYER_ACCENT_PRIMARY_TOKEN, getPlayerDisplayColor(playerColor))
    .replaceAll(PLAYER_ACCENT_DARK_TOKEN, getPlayerAccentDarkColor(playerColor));
}

export function characterSvgDataUri(rawSvg: string, playerColor: PlayerColorId): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(colorizeCharacterSvg(rawSvg, playerColor))}`;
}

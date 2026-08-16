import type { TileType } from '@monopoly/shared';

export type SpecialTileArtKind =
  | 'start-token'
  | 'jail-bars-2d'
  | 'police-2d'
  | 'question-mark-2d'
  | 'fortune-wheel-2d'
  | 'train-2d'
  | 'electric-bulb-2d'
  | 'water-faucet-2d'
  | 'utility-flat'
  | 'tax-paper-stack-2d'
  | 'parking-flat';

const SPECIAL_TILE_ART: Record<Exclude<TileType, 'normal'>, SpecialTileArtKind> = {
  start: 'start-token',
  jail: 'jail-bars-2d',
  gojail: 'police-2d',
  chance: 'question-mark-2d',
  chest: 'fortune-wheel-2d',
  railroad: 'train-2d',
  company: 'utility-flat',
  expense: 'tax-paper-stack-2d',
  parking: 'parking-flat',
};

export function getUtilityArtKind(label: string): 'electric-bulb-2d' | 'water-faucet-2d' {
  return label.toLocaleLowerCase('vi-VN').includes('nước')
    ? 'water-faucet-2d'
    : 'electric-bulb-2d';
}

export function getSpecialTileArtKind(
  tileType: Exclude<TileType, 'normal'>,
  label?: string,
): SpecialTileArtKind {
  if (tileType === 'company' && label) return getUtilityArtKind(label);
  return SPECIAL_TILE_ART[tileType];
}

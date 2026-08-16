import type { TileType } from '@monopoly/shared';

export type SpecialTileArtKind =
  | 'start-sign'
  | 'jail-bars-2d'
  | 'handcuffs-2d'
  | 'question-mark-2d'
  | 'fortune-wheel-2d'
  | 'train-convoy-2d'
  | 'electric-bulb-2d'
  | 'water-faucet-2d'
  | 'tax-paper-stack-2d'
  | 'parking-lot-2d';

const SPECIAL_TILE_ART: Record<Exclude<TileType, 'normal'>, SpecialTileArtKind> = {
  start: 'start-sign',
  jail: 'jail-bars-2d',
  gojail: 'handcuffs-2d',
  chance: 'question-mark-2d',
  chest: 'fortune-wheel-2d',
  railroad: 'train-convoy-2d',
  company: 'electric-bulb-2d',
  expense: 'tax-paper-stack-2d',
  parking: 'parking-lot-2d',
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

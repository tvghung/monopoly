import type { TileType } from '@monopoly/shared';

export type SpecialTileArtKind =
  | 'start-sign-25d'
  | 'jail-bars-2d'
  | 'handcuffs-25d'
  | 'question-mark-25d'
  | 'fortune-wheel-2d'
  | 'train-convoy-25d'
  | 'electric-bulb-2d'
  | 'water-faucet-25d'
  | 'utility-25d'
  | 'tax-paper-stack-25d'
  | 'parking-lot-25d';

const SPECIAL_TILE_ART: Record<Exclude<TileType, 'normal'>, SpecialTileArtKind> = {
  start: 'start-sign-25d',
  jail: 'jail-bars-2d',
  gojail: 'handcuffs-25d',
  chance: 'question-mark-25d',
  chest: 'fortune-wheel-2d',
  railroad: 'train-convoy-25d',
  company: 'utility-25d',
  expense: 'tax-paper-stack-25d',
  parking: 'parking-lot-25d',
};

export function getUtilityArtKind(label: string): 'electric-bulb-2d' | 'water-faucet-25d' {
  return label.toLocaleLowerCase('vi-VN').includes('nước')
    ? 'water-faucet-25d'
    : 'electric-bulb-2d';
}

export function getSpecialTileArtKind(
  tileType: Exclude<TileType, 'normal'>,
  label?: string,
): SpecialTileArtKind {
  if (tileType === 'company' && label) return getUtilityArtKind(label);
  return SPECIAL_TILE_ART[tileType];
}

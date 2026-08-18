import type { TileType } from '@monopoly/shared';

export type SpecialTileArtKind =
  | 'start-sign'
  | 'jail-bars-2d'
  | 'handcuffs-svg'
  | 'chance-question-svg'
  | 'fortune-wheel-svg'
  | 'railroad-train-svg'
  | 'electric-bulb-svg'
  | 'water-faucet-svg'
  | 'tax-paper-stack-2d'
  | 'parking-lot-2d';

const SPECIAL_TILE_ART: Record<Exclude<TileType, 'normal'>, SpecialTileArtKind> = {
  start: 'start-sign',
  jail: 'jail-bars-2d',
  gojail: 'handcuffs-svg',
  chance: 'chance-question-svg',
  chest: 'fortune-wheel-svg',
  railroad: 'railroad-train-svg',
  company: 'electric-bulb-svg',
  expense: 'tax-paper-stack-2d',
  parking: 'parking-lot-2d',
};

export function getUtilityArtKind(label: string): 'electric-bulb-svg' | 'water-faucet-svg' {
  return label.toLocaleLowerCase('vi-VN').includes('nước')
    ? 'water-faucet-svg'
    : 'electric-bulb-svg';
}

export function getSpecialTileArtKind(
  tileType: Exclude<TileType, 'normal'>,
  label?: string,
): SpecialTileArtKind {
  if (tileType === 'company' && label) return getUtilityArtKind(label);
  return SPECIAL_TILE_ART[tileType];
}

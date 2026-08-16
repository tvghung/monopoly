import type { TileType } from '@monopoly/shared';

export type SpecialTileArtKind =
  | 'start-token'
  | 'jail-bars-2d'
  | 'police-2d'
  | 'lucky-wheel-2d'
  | 'railroad-flat'
  | 'utility-flat'
  | 'tax-paper-stack-2d'
  | 'parking-flat';

const SPECIAL_TILE_ART: Record<Exclude<TileType, 'normal'>, SpecialTileArtKind> = {
  start: 'start-token',
  jail: 'jail-bars-2d',
  gojail: 'police-2d',
  chance: 'lucky-wheel-2d',
  chest: 'lucky-wheel-2d',
  railroad: 'railroad-flat',
  company: 'utility-flat',
  expense: 'tax-paper-stack-2d',
  parking: 'parking-flat',
};

export function getSpecialTileArtKind(tileType: Exclude<TileType, 'normal'>): SpecialTileArtKind {
  return SPECIAL_TILE_ART[tileType];
}

import type { Tile, TileType } from '@monopoly/shared';
import type { BoardMaterialProfile } from '../materials/boardMaterialSpecs';
import { translate, type Language } from '../../../../i18n/I18n';

export type DistrictSurfaceKey =
  | 'oldTownStone'
  | 'harborCeramic'
  | 'coolGranite'
  | 'terracottaBrick'
  | 'metroConcrete'
  | 'sandstoneTerrazzo'
  | 'ecoSlate'
  | 'premiumBrownStone';

export type DistrictSurfacePattern =
  | 'cobble'
  | 'ceramic'
  | 'granite'
  | 'brick'
  | 'concrete'
  | 'terrazzo'
  | 'beach'
  | 'slate'
  | 'slab'
  | 'paver';

export type DistrictSurfaceEmblem =
  | 'heritage'
  | 'harbor'
  | 'boutique'
  | 'market'
  | 'skyline'
  | 'marquee'
  | 'leaf'
  | 'landmark';

export interface DistrictPatternTuning {
  patternDensity: number;
  contrast: number;
  seamWidth: number;
  spacing: number;
}

export interface DistrictSurfaceDescriptor {
  surfaceKey: DistrictSurfaceKey;
  pattern: DistrictSurfacePattern;
  emblem: DistrictSurfaceEmblem;
  baseColor: string;
  secondaryColor: string;
  groutColor: string;
  materialProfile: Extract<
    BoardMaterialProfile,
    'districtStone' | 'districtBrick' | 'districtConcrete' | 'districtPremium'
  >;
  bumpScale: number;
  patternScale: number;
  patternTuning: DistrictPatternTuning;
  waterColor?: string;
}

/**
 * Plan 02 T02.16: base / secondary / grout take the hue and saturation of the plan 01 section 8.4 district
 * colors (the same colors the deed headers use) at the luminance of the v1 value they replace, so the tiles
 * stay light and sparse and the pattern contrast is unchanged. Surface keys, patterns and tuning did not
 * change. The brown and blue districts keep their warm stone secondary / grout by design.
 */
const PROPERTY_DESCRIPTORS: Record<string, DistrictSurfaceDescriptor> = {
  brown: {
    surfaceKey: 'oldTownStone', pattern: 'cobble', emblem: 'heritage',
    baseColor: '#c89d83', secondaryColor: '#f1d1a2', groutColor: '#b18b62',
    materialProfile: 'districtStone', bumpScale: 0.055, patternScale: 5,
    patternTuning: { patternDensity: 0.54, contrast: 0.24, seamWidth: 0.028, spacing: 1.18 },
  },
  lightblue: {
    surfaceKey: 'harborCeramic', pattern: 'ceramic', emblem: 'harbor',
    baseColor: '#74c5e9', secondaryColor: '#cceaf7', groutColor: '#3cafe0',
    materialProfile: 'districtStone', bumpScale: 0.032, patternScale: 4,
    patternTuning: { patternDensity: 0.48, contrast: 0.2, seamWidth: 0.022, spacing: 1.22 },
  },
  pink: {
    surfaceKey: 'coolGranite', pattern: 'granite', emblem: 'boutique',
    baseColor: '#eb84b0', secondaryColor: '#f7d1e2', groutColor: '#e872a5',
    materialProfile: 'districtStone', bumpScale: 0.04, patternScale: 6,
    patternTuning: { patternDensity: 0.42, contrast: 0.18, seamWidth: 0.018, spacing: 1.26 },
  },
  orange: {
    surfaceKey: 'terracottaBrick', pattern: 'brick', emblem: 'market',
    baseColor: '#ef7c13', secondaryColor: '#f6b072', groutColor: '#c3630d',
    materialProfile: 'districtBrick', bumpScale: 0.06, patternScale: 5,
    patternTuning: { patternDensity: 0.52, contrast: 0.22, seamWidth: 0.024, spacing: 1.16 },
  },
  red: {
    surfaceKey: 'metroConcrete', pattern: 'concrete', emblem: 'skyline',
    baseColor: '#dd7c70', secondaryColor: '#ecb6af', groutColor: '#d14d3c',
    materialProfile: 'districtConcrete', bumpScale: 0.045, patternScale: 5,
    patternTuning: { patternDensity: 0.38, contrast: 0.16, seamWidth: 0.015, spacing: 1.3 },
  },
  yellow: {
    surfaceKey: 'sandstoneTerrazzo', pattern: 'beach', emblem: 'marquee',
    baseColor: '#f3c846', secondaryColor: '#fcf0ca', groutColor: '#d6a50d',
    waterColor: '#70cbd1', materialProfile: 'districtStone', bumpScale: 0.028, patternScale: 4,
    patternTuning: { patternDensity: 0.34, contrast: 0.14, seamWidth: 0.012, spacing: 1.34 },
  },
  green: {
    surfaceKey: 'ecoSlate', pattern: 'paver', emblem: 'leaf',
    baseColor: '#74c98b', secondaryColor: '#d2eeda', groutColor: '#43af61',
    materialProfile: 'districtPremium', bumpScale: 0.034, patternScale: 4,
    patternTuning: { patternDensity: 0.42, contrast: 0.16, seamWidth: 0.018, spacing: 1.34 },
  },
  blue: {
    surfaceKey: 'premiumBrownStone', pattern: 'slab', emblem: 'landmark',
    baseColor: '#7c9edd', secondaryColor: '#ebccb0', groutColor: '#9c7255',
    materialProfile: 'districtPremium', bumpScale: 0.032, patternScale: 3,
    patternTuning: { patternDensity: 0.38, contrast: 0.15, seamWidth: 0.016, spacing: 1.4 },
  },
};

const SPECIAL_TILE_LABELS: Partial<Record<TileType, Parameters<typeof translate>[0]>> = {
  start: 'board.go',
  jail: 'board.jail',
  gojail: 'board.goToJail',
  chance: 'board.chance',
  chest: 'board.communityChest',
  railroad: 'property.group.railroad',
  company: 'property.group.utility',
  expense: 'board.tax',
  parking: 'board.freeParking',
};

const FALLBACK_DESCRIPTOR = PROPERTY_DESCRIPTORS.brown;

export const CANONICAL_PROPERTY_GROUPS = Object.freeze(Object.keys(PROPERTY_DESCRIPTORS));
export const DISTRICT_SURFACE_KEYS = Object.freeze(
  CANONICAL_PROPERTY_GROUPS.map(group => PROPERTY_DESCRIPTORS[group].surfaceKey),
);

const DESCRIPTORS_BY_SURFACE_KEY = new Map(
  CANONICAL_PROPERTY_GROUPS.map(group => {
    const descriptor = PROPERTY_DESCRIPTORS[group];
    return [descriptor.surfaceKey, descriptor] as const;
  }),
);

export function getPropertyVisualDescriptor(
  rawColor: string | null | undefined,
): DistrictSurfaceDescriptor {
  if (!rawColor) return FALLBACK_DESCRIPTOR;
  return PROPERTY_DESCRIPTORS[rawColor.toLowerCase()] ?? FALLBACK_DESCRIPTOR;
}

export function getDistrictSurfaceDescriptor(
  tile: Tile,
): DistrictSurfaceDescriptor | undefined {
  if (tile.tileType !== 'normal') return undefined;
  return getPropertyVisualDescriptor(tile.color);
}

export function getDistrictSurfaceDescriptorByKey(
  surfaceKey: DistrictSurfaceKey,
): DistrictSurfaceDescriptor {
  return DESCRIPTORS_BY_SURFACE_KEY.get(surfaceKey) ?? FALLBACK_DESCRIPTOR;
}

export function getSpecialTileLabel(tileType: TileType, language: Language): string {
  return translate(SPECIAL_TILE_LABELS[tileType] ?? 'board.tileGeneric', language);
}

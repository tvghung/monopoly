import type { Tile, TileType } from '@monopoly/shared';
import type { BoardMaterialProfile } from '../materials/boardMaterialSpecs';

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

const PROPERTY_DESCRIPTORS: Record<string, DistrictSurfaceDescriptor> = {
  brown: {
    surfaceKey: 'oldTownStone', pattern: 'cobble', emblem: 'heritage',
    baseColor: '#d59b4a', secondaryColor: '#f1d1a2', groutColor: '#b18b62',
    materialProfile: 'districtStone', bumpScale: 0.055, patternScale: 5,
    patternTuning: { patternDensity: 0.54, contrast: 0.24, seamWidth: 0.028, spacing: 1.18 },
  },
  lightblue: {
    surfaceKey: 'harborCeramic', pattern: 'ceramic', emblem: 'harbor',
    baseColor: '#5fc9e3', secondaryColor: '#c4ecf5', groutColor: '#5cafc4',
    materialProfile: 'districtStone', bumpScale: 0.032, patternScale: 4,
    patternTuning: { patternDensity: 0.48, contrast: 0.2, seamWidth: 0.022, spacing: 1.22 },
  },
  pink: {
    surfaceKey: 'coolGranite', pattern: 'granite', emblem: 'boutique',
    baseColor: '#e088bd', secondaryColor: '#f1d4e2', groutColor: '#b98cae',
    materialProfile: 'districtStone', bumpScale: 0.04, patternScale: 6,
    patternTuning: { patternDensity: 0.42, contrast: 0.18, seamWidth: 0.018, spacing: 1.26 },
  },
  orange: {
    surfaceKey: 'terracottaBrick', pattern: 'brick', emblem: 'market',
    baseColor: '#f07a3c', secondaryColor: '#f2b18b', groutColor: '#b86849',
    materialProfile: 'districtBrick', bumpScale: 0.06, patternScale: 5,
    patternTuning: { patternDensity: 0.52, contrast: 0.22, seamWidth: 0.024, spacing: 1.16 },
  },
  red: {
    surfaceKey: 'metroConcrete', pattern: 'concrete', emblem: 'skyline',
    baseColor: '#e4767e', secondaryColor: '#edb5b1', groutColor: '#a96671',
    materialProfile: 'districtConcrete', bumpScale: 0.045, patternScale: 5,
    patternTuning: { patternDensity: 0.38, contrast: 0.16, seamWidth: 0.015, spacing: 1.3 },
  },
  yellow: {
    surfaceKey: 'sandstoneTerrazzo', pattern: 'beach', emblem: 'marquee',
    baseColor: '#f4c83f', secondaryColor: '#fff0bd', groutColor: '#cba75b',
    waterColor: '#70cbd1', materialProfile: 'districtStone', bumpScale: 0.028, patternScale: 4,
    patternTuning: { patternDensity: 0.34, contrast: 0.14, seamWidth: 0.012, spacing: 1.34 },
  },
  green: {
    surfaceKey: 'ecoSlate', pattern: 'paver', emblem: 'leaf',
    baseColor: '#75ca78', secondaryColor: '#d6edcf', groutColor: '#7da47f',
    materialProfile: 'districtPremium', bumpScale: 0.034, patternScale: 4,
    patternTuning: { patternDensity: 0.42, contrast: 0.16, seamWidth: 0.018, spacing: 1.34 },
  },
  blue: {
    surfaceKey: 'premiumBrownStone', pattern: 'slab', emblem: 'landmark',
    baseColor: '#6da0e3', secondaryColor: '#ebccb0', groutColor: '#9c7255',
    materialProfile: 'districtPremium', bumpScale: 0.032, patternScale: 3,
    patternTuning: { patternDensity: 0.38, contrast: 0.15, seamWidth: 0.016, spacing: 1.4 },
  },
};

const SPECIAL_TILE_LABELS: Partial<Record<TileType, string>> = {
  start: 'Xuất phát',
  jail: 'Nhà tù / Thăm tù',
  gojail: 'Vào tù',
  chance: 'Cơ hội',
  chest: 'Khí vận',
  railroad: 'Ga tàu',
  company: 'Công ty',
  expense: 'Thuế',
  parking: 'Bãi đỗ xe',
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

export function getSpecialTileLabel(tileType: TileType): string {
  return SPECIAL_TILE_LABELS[tileType] ?? 'Ô CỜ';
}

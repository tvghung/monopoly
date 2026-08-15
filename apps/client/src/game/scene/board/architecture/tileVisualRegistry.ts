import type { Tile, TileType } from '@monopoly/shared';
import {
  getPropertyGroupVisualStyle,
  type PropertyMotif,
} from '../../../ui/propertyVisualColors';

export type TileVisualFamily = 'PROPERTY' | 'SPECIAL' | 'RAILROAD' | 'UTILITY';
export type TileVisualEmblem =
  | 'heritage'
  | 'harbor'
  | 'boutique'
  | 'market'
  | 'skyline'
  | 'marquee'
  | 'leaf'
  | 'landmark'
  | 'station'
  | 'water'
  | 'power'
  | 'start'
  | 'jail'
  | 'gojail'
  | 'chance'
  | 'chest'
  | 'expense'
  | 'parking';

export interface TileVisualDescriptor {
  family: TileVisualFamily;
  primaryColor: string;
  secondaryColor: string;
  surfaceTint: string;
  trimColor: string;
  motif: PropertyMotif;
  emblem: TileVisualEmblem;
  materialProfile: 'tileTop' | 'propertyTrim';
  label: string;
}

const PROPERTY_DESCRIPTORS: Record<string, TileVisualDescriptor> = {
  brown: {
    family: 'PROPERTY', primaryColor: '#a85532', secondaryColor: '#7d3827', surfaceTint: '#fff0e7',
    trimColor: '#f2c8a9', motif: 'brick', emblem: 'heritage', materialProfile: 'tileTop', label: 'KHU PHỐ CŨ',
  },
  lightblue: {
    family: 'PROPERTY', primaryColor: '#19b9d3', secondaryColor: '#087e9a', surfaceTint: '#e5fbff',
    trimColor: '#a4e7f0', motif: 'water', emblem: 'harbor', materialProfile: 'tileTop', label: 'BẾN CẢNG',
  },
  pink: {
    family: 'PROPERTY', primaryColor: '#e34bb1', secondaryColor: '#ad2e81', surfaceTint: '#ffe4f5',
    trimColor: '#f3a1d4', motif: 'shopping', emblem: 'boutique', materialProfile: 'tileTop', label: 'PHỐ VUI CHƠI',
  },
  orange: {
    family: 'PROPERTY', primaryColor: '#f47723', secondaryColor: '#b84d16', surfaceTint: '#fff0df',
    trimColor: '#ffc07c', motif: 'market', emblem: 'market', materialProfile: 'tileTop', label: 'KHU ẨM THỰC',
  },
  red: {
    family: 'PROPERTY', primaryColor: '#e24451', secondaryColor: '#a62d38', surfaceTint: '#ffe4e6',
    trimColor: '#f09aa1', motif: 'downtown', emblem: 'skyline', materialProfile: 'tileTop', label: 'TRUNG TÂM',
  },
  yellow: {
    family: 'PROPERTY', primaryColor: '#f2bd19', secondaryColor: '#b47e0d', surfaceTint: '#fff7cc',
    trimColor: '#f8df73', motif: 'nightlife', emblem: 'marquee', materialProfile: 'tileTop', label: 'ĐIỂM SÁNG',
  },
  green: {
    family: 'PROPERTY', primaryColor: '#24a662', secondaryColor: '#14734a', surfaceTint: '#e4f8ea',
    trimColor: '#8ed5a8', motif: 'eco', emblem: 'leaf', materialProfile: 'tileTop', label: 'ĐẠI LỘ XANH',
  },
  blue: {
    family: 'PROPERTY', primaryColor: '#536ddd', secondaryColor: '#293f9d', surfaceTint: '#e9ecff',
    trimColor: '#9ba9f0', motif: 'luxury', emblem: 'landmark', materialProfile: 'tileTop', label: 'BIỂU TƯỢNG',
  },
};

const SPECIAL_DESCRIPTORS: Record<TileType, TileVisualDescriptor> = {
  start: {
    family: 'SPECIAL', primaryColor: '#ffc425', secondaryColor: '#b87808', surfaceTint: '#fff7d6',
    trimColor: '#f5d86b', motif: 'nightlife', emblem: 'start', materialProfile: 'tileTop', label: 'ĐIỂM KHỞI ĐẦU',
  },
  jail: {
    family: 'SPECIAL', primaryColor: '#8171dc', secondaryColor: '#4f4499', surfaceTint: '#eeeafd',
    trimColor: '#b7acf3', motif: 'downtown', emblem: 'jail', materialProfile: 'tileTop', label: 'NHÀ TÙ / THĂM TÙ',
  },
  gojail: {
    family: 'SPECIAL', primaryColor: '#e9545e', secondaryColor: '#9e2d3c', surfaceTint: '#ffe7e7',
    trimColor: '#f39da3', motif: 'downtown', emblem: 'gojail', materialProfile: 'tileTop', label: 'VÀO TÙ',
  },
  chance: {
    family: 'SPECIAL', primaryColor: '#ff9b2f', secondaryColor: '#b65b11', surfaceTint: '#fff0da',
    trimColor: '#ffd18d', motif: 'shopping', emblem: 'chance', materialProfile: 'tileTop', label: 'CƠ HỘI',
  },
  chest: {
    family: 'SPECIAL', primaryColor: '#12b7a8', secondaryColor: '#08736c', surfaceTint: '#def8f3',
    trimColor: '#8be0d5', motif: 'water', emblem: 'chest', materialProfile: 'tileTop', label: 'KHÍ VẬN',
  },
  railroad: {
    family: 'RAILROAD', primaryColor: '#46637f', secondaryColor: '#283e57', surfaceTint: '#edf2f6',
    trimColor: '#94abc0', motif: 'rail', emblem: 'station', materialProfile: 'tileTop', label: 'GA TÀU',
  },
  company: {
    family: 'UTILITY', primaryColor: '#2a82d6', secondaryColor: '#175493', surfaceTint: '#e5f1ff',
    trimColor: '#93c5f4', motif: 'water', emblem: 'power', materialProfile: 'tileTop', label: 'CÔNG TY',
  },
  expense: {
    family: 'SPECIAL', primaryColor: '#e9545e', secondaryColor: '#9e2d3c', surfaceTint: '#ffe7e7',
    trimColor: '#f39da3', motif: 'downtown', emblem: 'expense', materialProfile: 'tileTop', label: 'THUẾ / PHÍ',
  },
  parking: {
    family: 'SPECIAL', primaryColor: '#36aa63', secondaryColor: '#14734a', surfaceTint: '#e5f6e6',
    trimColor: '#93d5a8', motif: 'eco', emblem: 'parking', materialProfile: 'tileTop', label: 'BÃI ĐỖ XE',
  },
  normal: {
    family: 'SPECIAL', primaryColor: '#75b8ad', secondaryColor: '#3d766e', surfaceTint: '#edf9f6',
    trimColor: '#9fd7ca', motif: 'water', emblem: 'harbor', materialProfile: 'tileTop', label: 'Ô CỜ',
  },
};

const FALLBACK_DESCRIPTOR = SPECIAL_DESCRIPTORS.normal;

export const CANONICAL_PROPERTY_GROUPS = Object.freeze(Object.keys(PROPERTY_DESCRIPTORS));

export function getTileVisualDescriptor(tile: Tile): TileVisualDescriptor {
  if (tile.color) {
    const descriptor = PROPERTY_DESCRIPTORS[tile.color.toLowerCase()];
    if (descriptor) return descriptor;
    const fallback = getPropertyGroupVisualStyle(tile.color);
    return {
      ...FALLBACK_DESCRIPTOR,
      family: 'PROPERTY',
      primaryColor: fallback.color,
      surfaceTint: fallback.tint,
      motif: fallback.motif,
    };
  }
  return SPECIAL_DESCRIPTORS[tile.tileType] ?? FALLBACK_DESCRIPTOR;
}

export function getTileVisualDescriptorByType(tileType: TileType): TileVisualDescriptor {
  return SPECIAL_DESCRIPTORS[tileType] ?? FALLBACK_DESCRIPTOR;
}

export function getPropertyVisualDescriptor(rawColor: string | null | undefined): TileVisualDescriptor {
  if (!rawColor) return FALLBACK_DESCRIPTOR;
  return PROPERTY_DESCRIPTORS[rawColor.toLowerCase()] ?? FALLBACK_DESCRIPTOR;
}

export type PropertyMotif = 'brick' | 'water' | 'shopping' | 'market' | 'downtown' | 'nightlife' | 'eco' | 'luxury' | 'rail';

export interface PropertyGroupVisualStyle {
  color: string;
  tint: string;
  motif: PropertyMotif;
  label: string;
}

const PROPERTY_GROUP_VISUAL_STYLES: Record<string, PropertyGroupVisualStyle> = {
  brown: { color: '#a8522f', tint: '#fff0e7', motif: 'brick', label: 'Nhóm Nâu' },
  lightblue: { color: '#00a8d4', tint: '#e5f8fd', motif: 'water', label: 'Nhóm Xanh nhạt' },
  pink: { color: '#e83db0', tint: '#ffe4f5', motif: 'shopping', label: 'Nhóm Hồng' },
  orange: { color: '#f16b1f', tint: '#fff0df', motif: 'market', label: 'Nhóm Cam' },
  red: { color: '#e5394f', tint: '#ffe4e6', motif: 'downtown', label: 'Nhóm Đỏ' },
  yellow: { color: '#f2b300', tint: '#fff7cc', motif: 'nightlife', label: 'Nhóm Vàng' },
  green: { color: '#00a96b', tint: '#e4f8ea', motif: 'eco', label: 'Nhóm Xanh lá' },
  blue: { color: '#4a63d9', tint: '#e9ecff', motif: 'luxury', label: 'Nhóm Xanh dương' },
  railroad: { color: '#426486', tint: '#eef3f8', motif: 'rail', label: 'Ga tàu' },
};

const FALLBACK_STYLE: PropertyGroupVisualStyle = {
  color: '#00a892',
  tint: '#edf9f6',
  motif: 'water',
  label: 'Tài sản',
};

export function getPropertyGroupVisualStyle(rawColor: string | null | undefined): PropertyGroupVisualStyle {
  if (!rawColor) return FALLBACK_STYLE;
  return PROPERTY_GROUP_VISUAL_STYLES[rawColor.toLowerCase()] ?? FALLBACK_STYLE;
}

export function getPropertyGroupDisplayColor(rawColor: string | null | undefined): string {
  return getPropertyGroupVisualStyle(rawColor).color;
}

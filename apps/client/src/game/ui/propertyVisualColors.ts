export type PropertyMotif = 'brick' | 'water' | 'shopping' | 'market' | 'downtown' | 'nightlife' | 'eco' | 'luxury' | 'rail';

export interface PropertyGroupVisualStyle {
  color: string;
  tint: string;
  motif: PropertyMotif;
}

const PROPERTY_GROUP_VISUAL_STYLES: Record<string, PropertyGroupVisualStyle> = {
  brown: { color: '#a8522f', tint: '#fff0e7', motif: 'brick' },
  lightblue: { color: '#00a8d4', tint: '#e5f8fd', motif: 'water' },
  pink: { color: '#e83db0', tint: '#ffe4f5', motif: 'shopping' },
  orange: { color: '#f16b1f', tint: '#fff0df', motif: 'market' },
  red: { color: '#e5394f', tint: '#ffe4e6', motif: 'downtown' },
  yellow: { color: '#f2b300', tint: '#fff7cc', motif: 'nightlife' },
  green: { color: '#00a96b', tint: '#e4f8ea', motif: 'eco' },
  blue: { color: '#4a63d9', tint: '#e9ecff', motif: 'luxury' },
  railroad: { color: '#426486', tint: '#eef3f8', motif: 'rail' },
};

const FALLBACK_STYLE: PropertyGroupVisualStyle = {
  color: '#00a892',
  tint: '#edf9f6',
  motif: 'water',
};

export function getPropertyGroupVisualStyle(rawColor: string | null | undefined): PropertyGroupVisualStyle {
  if (!rawColor) return FALLBACK_STYLE;
  return PROPERTY_GROUP_VISUAL_STYLES[rawColor.toLowerCase()] ?? FALLBACK_STYLE;
}

export function getPropertyGroupDisplayColor(rawColor: string | null | undefined): string {
  return getPropertyGroupVisualStyle(rawColor).color;
}

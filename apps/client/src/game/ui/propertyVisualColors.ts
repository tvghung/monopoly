export type PropertyMotif = 'brick' | 'water' | 'shopping' | 'market' | 'downtown' | 'nightlife' | 'eco' | 'luxury' | 'rail';

export interface PropertyGroupVisualStyle {
  color: string;
  tint: string;
  motif: PropertyMotif;
}

const PROPERTY_GROUP_VISUAL_STYLES: Record<string, PropertyGroupVisualStyle> = {
  brown: { color: '#c7a27f', tint: '#f7eadc', motif: 'brick' },
  lightblue: { color: '#8fd5e4', tint: '#e1f7fb', motif: 'water' },
  pink: { color: '#e7a3cc', tint: '#fce8f6', motif: 'shopping' },
  orange: { color: '#f4b06d', tint: '#fff0dc', motif: 'market' },
  red: { color: '#eb8c96', tint: '#ffe5e7', motif: 'downtown' },
  yellow: { color: '#efd36c', tint: '#fff7d4', motif: 'nightlife' },
  green: { color: '#83c68d', tint: '#e3f6e5', motif: 'eco' },
  blue: { color: '#88a8e4', tint: '#e7edff', motif: 'luxury' },
  railroad: { color: '#a8b7c4', tint: '#edf2f6', motif: 'rail' },
};

const FALLBACK_STYLE: PropertyGroupVisualStyle = {
  color: '#dce8e3',
  tint: '#f2f8f6',
  motif: 'water',
};

export function getPropertyGroupVisualStyle(rawColor: string | null | undefined): PropertyGroupVisualStyle {
  if (!rawColor) return FALLBACK_STYLE;
  return PROPERTY_GROUP_VISUAL_STYLES[rawColor.toLowerCase()] ?? FALLBACK_STYLE;
}

export function getPropertyGroupDisplayColor(rawColor: string | null | undefined): string {
  return getPropertyGroupVisualStyle(rawColor).color;
}

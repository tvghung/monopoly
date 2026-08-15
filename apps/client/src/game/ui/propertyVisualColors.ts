export type PropertyMotif = 'brick' | 'water' | 'shopping' | 'market' | 'downtown' | 'nightlife' | 'eco' | 'luxury' | 'rail';

export interface PropertyGroupVisualStyle {
  color: string;
  tint: string;
  motif: PropertyMotif;
}

const PROPERTY_GROUP_VISUAL_STYLES: Record<string, PropertyGroupVisualStyle> = {
  brown: { color: '#a85532', tint: '#fff0e7', motif: 'brick' },
  lightblue: { color: '#19b9d3', tint: '#e5fbff', motif: 'water' },
  pink: { color: '#e34bb1', tint: '#ffe4f5', motif: 'shopping' },
  orange: { color: '#f47723', tint: '#fff0df', motif: 'market' },
  red: { color: '#e24451', tint: '#ffe4e6', motif: 'downtown' },
  yellow: { color: '#f2bd19', tint: '#fff7cc', motif: 'nightlife' },
  green: { color: '#24a662', tint: '#e4f8ea', motif: 'eco' },
  blue: { color: '#536ddd', tint: '#e9ecff', motif: 'luxury' },
  railroad: { color: '#546982', tint: '#eef3f8', motif: 'rail' },
};

const FALLBACK_STYLE: PropertyGroupVisualStyle = {
  color: '#75b8ad',
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

const PROPERTY_GROUP_DISPLAY_COLORS: Record<string, string> = {
  brown: '#c7a27f',
  lightblue: '#8fd5e4',
  pink: '#e7a3cc',
  orange: '#f4b06d',
  red: '#eb8c96',
  yellow: '#efd36c',
  green: '#83c68d',
  blue: '#88a8e4',
  railroad: '#a8b7c4',
};

export function getPropertyGroupDisplayColor(rawColor: string | null | undefined): string {
  if (!rawColor) return '#dce8e3';
  return PROPERTY_GROUP_DISPLAY_COLORS[rawColor.toLowerCase()] ?? '#dce8e3';
}


import type { Tile } from '@monopoly/shared';
import { formatMoney } from '../../../../presentation';
import { TILE_SURFACE_INSET } from '../boardLayout';
import { PROPERTY_NAME_Y } from '../architecture/boardArtSpec';
import { getSpecialTileLabel } from '../architecture/tileVisualRegistry';
import SdfSurfaceText, { limitSurfaceTextLines } from './SdfSurfaceText';

interface TileTextLayerProps {
  tile: Tile;
  name: string;
  size: readonly [number, number];
}

export interface TileTextPresentation {
  value: string;
  fontSize: number;
  maxWidth: number;
  lineHeight: number;
  positionZ: number;
}

function getPropertyLineCount(value: string): 1 | 2 | 3 {
  const words = value.trim().split(/\s+/).filter(Boolean);
  if (value.length <= 11 || (words.length <= 2 && value.length <= 14)) return 1;
  if (value.length <= 20 && words.length <= 4) return 2;
  return 3;
}

export function wrapPropertyName(value: string, maxLines: 1 | 2 | 3): string {
  const limitedValue = limitSurfaceTextLines(value, maxLines, 4);
  const words = limitedValue.trim().split(/\s+/).filter(Boolean);
  if (maxLines === 1 || words.length <= 1) return words.join(' ');

  const targetLength = Math.ceil(limitedValue.length / maxLines);
  const lines: string[] = [];
  let currentLine = '';
  words.forEach(word => {
    const candidate = currentLine ? `${currentLine} ${word}` : word;
    if (currentLine && candidate.length > targetLength && lines.length < maxLines - 1) {
      lines.push(currentLine);
      currentLine = word;
      return;
    }
    currentLine = candidate;
  });
  if (currentLine) lines.push(currentLine);
  return lines.slice(0, maxLines).join('\n');
}

export function getTileTextPresentation(
  tile: Tile,
  name: string,
  size: readonly [number, number],
): TileTextPresentation {
  const surfaceWidth = Math.max(0.3, size[0] - TILE_SURFACE_INSET);
  if (tile.tileType === 'normal') {
    const normalizedName = name.trim();
    const lineCount = getPropertyLineCount(normalizedName);
    return {
      value: wrapPropertyName(normalizedName, lineCount),
      fontSize: lineCount === 1 ? 0.205 : lineCount === 2 ? 0.19 : 0.17,
      maxWidth: surfaceWidth * 0.9,
      lineHeight: 1.04,
      positionZ: 0,
    };
  }

  const cornerScale = Math.min(size[0], size[1]) > 2 ? 1.2 : 1;
  const label = getSpecialTileLabel(tile.tileType);
  const lines = [label];
  if (name.trim().toLocaleUpperCase('vi-VN') !== label.toLocaleUpperCase('vi-VN')) {
    lines.push(name.trim());
  }
  if (typeof tile.price === 'number') lines.push(formatMoney(tile.price));
  return {
    value: lines.slice(0, 3).join('\n'),
    fontSize: (lines.length >= 3 ? 0.1 : 0.11) * cornerScale,
    maxWidth: surfaceWidth * 0.88,
    lineHeight: 1.02,
    positionZ: 0.04,
  };
}

export default function TileTextLayer({ tile, name, size }: TileTextLayerProps) {
  const presentation = getTileTextPresentation(tile, name, size);
  return (
    <group name="TileTextLayer">
      <SdfSurfaceText
        name="TileNameText"
        value={presentation.value}
        position={[0, PROPERTY_NAME_Y, presentation.positionZ]}
        fontSize={presentation.fontSize}
        maxWidth={presentation.maxWidth}
        lineHeight={presentation.lineHeight}
      />
    </group>
  );
}

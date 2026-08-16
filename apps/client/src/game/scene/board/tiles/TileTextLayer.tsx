import type { Tile } from '@monopoly/shared';
import type { BoardSide } from '../boardLayout';
import { TILE_SURFACE_INSET } from '../boardLayout';
import { PROPERTY_NAME_Y } from '../architecture/boardArtSpec';
import { getSpecialTileLabel } from '../architecture/tileVisualRegistry';
import SdfSurfaceText, { limitSurfaceTextLines } from './SdfSurfaceText';
import { getInwardTextTopDirection, getTilePanelLayoutForTileSize } from './tilePanelLayout';

interface TileTextLayerProps {
  tile: Tile;
  name: string;
  size: readonly [number, number];
  side?: BoardSide;
}

export interface TileTextPresentation {
  value: string;
  fontSize: number;
  maxWidth: number;
  lineHeight: number;
  positionZ: number;
  footer: boolean;
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
  isCorner = size[0] > 2,
): TileTextPresentation {
  const surfaceWidth = Math.max(0.3, size[0] - TILE_SURFACE_INSET);
  const panelLayout = getTilePanelLayoutForTileSize(size);
  if (tile.tileType === 'normal') {
    const normalizedName = name.trim();
    const lineCount = getPropertyLineCount(normalizedName);
    return {
      value: wrapPropertyName(normalizedName, lineCount),
      fontSize: lineCount === 1 ? 0.255 : lineCount === 2 ? 0.225 : 0.195,
      maxWidth: surfaceWidth * 0.96,
      lineHeight: 1.04,
      positionZ: isCorner ? 0 : panelLayout.footerCenterLocalZ,
      footer: !isCorner,
    };
  }

  const label = tile.tileType === 'company' ? name.trim() : getSpecialTileLabel(tile.tileType);
  const lineCount = label.length > 14 ? 2 : 1;
  const cornerScale = isCorner ? 1.12 : 1;
  return {
    value: wrapPropertyName(label, lineCount),
    fontSize: (lineCount === 1 ? 0.215 : 0.19) * cornerScale,
    maxWidth: surfaceWidth * 0.95,
    lineHeight: 1.02,
    positionZ: isCorner ? 0 : panelLayout.footerCenterLocalZ,
    footer: !isCorner,
  };
}

export default function TileTextLayer({ tile, name, size, side = 'BOTTOM' }: TileTextLayerProps) {
  const presentation = getTileTextPresentation(tile, name, size, side === 'CORNER');
  const inwardTopDirection = getInwardTextTopDirection(side);
  return (
    <group
      name="TileTextLayer"
      userData={{
        region: presentation.footer ? 'footer' : 'corner',
        textFacing: 'inward',
        side,
        inwardTopDirection,
      }}
    >
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

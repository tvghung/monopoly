import type { Tile } from '@monopoly/shared';
import { PROPERTY_NAME_Y } from '../architecture/boardArtSpec';
import { getSpecialTileLabel } from '../architecture/tileVisualRegistry';
import SdfSurfaceText, { limitSurfaceTextLines } from './SdfSurfaceText';
import {
  getInwardTextTopDirection,
  type TilePanelLayout,
} from './tilePanelLayout';

interface TileTextLayerProps {
  tile: Tile;
  name: string;
  panel: TilePanelLayout;
}

export interface TileTextPresentation {
  value: string;
  fontSize: number;
  maxWidth: number;
  lineHeight: number;
  positionZ: number;
  footer: boolean;
  region: 'footer' | 'corner';
}

export function shouldRenderTileText(tileType: Tile['tileType']): boolean {
  return tileType !== 'start' && tileType !== 'jail' && tileType !== 'gojail' && tileType !== 'parking';
}

function getPropertyLineCount(value: string): 1 | 2 {
  const words = value.trim().split(/\s+/).filter(Boolean);
  if (value.length <= 12 || (words.length <= 2 && value.length <= 15)) return 1;
  return 2;
}

export function wrapPropertyName(value: string, maxLines: 1 | 2): string {
  const limitedValue = limitSurfaceTextLines(value, maxLines, 4);
  const words = limitedValue.trim().split(/\s+/).filter(Boolean);
  if (maxLines === 1 || words.length <= 1) return words.join(' ');

  const totalLength = words.join(' ').length;
  let splitIndex = 1;
  let closestDistance = Number.POSITIVE_INFINITY;
  for (let index = 1; index < words.length; index += 1) {
    const firstLength = words.slice(0, index).join(' ').length;
    const distance = Math.abs(firstLength - totalLength / 2);
    if (distance < closestDistance) {
      closestDistance = distance;
      splitIndex = index;
    }
  }
  return [words.slice(0, splitIndex).join(' '), words.slice(splitIndex).join(' ')].join('\n');
}

export function getTileTextPresentation(
  tile: Tile,
  name: string,
  panel: TilePanelLayout,
): TileTextPresentation {
  const surfaceWidth = panel.surfaceSize[0];
  const isCorner = panel.side === 'CORNER';
  if (tile.tileType === 'normal') {
    const normalizedName = name.trim();
    const lineCount = getPropertyLineCount(normalizedName);
    return {
      value: wrapPropertyName(normalizedName, lineCount),
      fontSize: lineCount === 1 ? 0.34 : 0.28,
      maxWidth: surfaceWidth * 0.95,
      lineHeight: 1.03,
      positionZ: isCorner ? 0 : panel.footerCenterLocalZ,
      footer: !isCorner,
      region: isCorner ? 'corner' : 'footer',
    };
  }

  const label = tile.tileType === 'company' ? name.trim() : getSpecialTileLabel(tile.tileType);
  const lineCount = label.length > 14 ? 2 : 1;
  const cornerScale = isCorner ? 1.12 : 1;
  return {
    value: wrapPropertyName(label, lineCount),
    fontSize: (lineCount === 1 ? 0.30 : 0.255) * cornerScale,
    maxWidth: surfaceWidth * 0.95,
    lineHeight: 1.03,
    positionZ: isCorner
      ? 0
      : panel.footerCenterLocalZ,
    footer: !isCorner,
    region: isCorner ? 'corner' : 'footer',
  };
}

export default function TileTextLayer({ tile, name, panel }: TileTextLayerProps) {
  if (!shouldRenderTileText(tile.tileType)) return null;
  const presentation = getTileTextPresentation(tile, name, panel);
  const inwardTopDirection = getInwardTextTopDirection(panel.side);
  return (
    <group
      name="TileTextLayer"
      userData={{
        region: presentation.region,
        textFacing: 'inward',
        side: panel.side,
        inwardTopDirection,
        contentRotationY: panel.contentRotationY,
      }}
    >
      <SdfSurfaceText
        name="TileNameText"
        value={presentation.value}
        position={[0, PROPERTY_NAME_Y, presentation.positionZ]}
        fontSize={presentation.fontSize}
        maxWidth={presentation.maxWidth}
        lineHeight={presentation.lineHeight}
        rotationZ={panel.contentRotationY}
      />
    </group>
  );
}

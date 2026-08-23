import type { Tile } from '@monopoly/shared';
import { PROPERTY_NAME_Y } from '../architecture/boardArtSpec';
import { getSpecialTileLabel } from '../architecture/tileVisualRegistry';
import SdfSurfaceText, { limitSurfaceTextLines } from './SdfSurfaceText';
import {
  fitTileText,
  getPreferredTwoLineValue,
  NORMAL_TILE_TEXT_MIN_SIZE,
  NORMAL_TILE_TEXT_ONE_LINE_SIZE,
  NORMAL_TILE_TEXT_TWO_LINE_SIZE,
  SPECIAL_TILE_TEXT_MIN_SIZE,
  SPECIAL_TILE_TEXT_ONE_LINE_SIZE,
  SPECIAL_TILE_TEXT_TWO_LINE_SIZE,
  TILE_TEXT_FOOTER_HEIGHT_RATIO,
  TILE_TEXT_LINE_HEIGHT,
  TILE_TEXT_SAFE_WIDTH_RATIO,
} from './tileTextFitting';
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
  maxHeight: number;
  lineHeight: number;
  positionZ: number;
  footer: boolean;
  region: 'footer' | 'corner';
  whiteSpace: 'nowrap';
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
  if (maxLines === 1) return limitedValue.trim().replace(/\s+/g, ' ');
  return getPreferredTwoLineValue(limitedValue);
}

function getTextAreaMaxHeight(panel: TilePanelLayout, isCorner: boolean): number {
  const textAreaDepth = isCorner ? panel.surfaceSize[1] : panel.footerSize[1];
  return textAreaDepth * (isCorner ? 0.84 : TILE_TEXT_FOOTER_HEIGHT_RATIO);
}

export function getTileTextPresentation(
  tile: Tile,
  name: string,
  panel: TilePanelLayout,
): TileTextPresentation {
  const surfaceWidth = panel.surfaceSize[0];
  const isCorner = panel.side === 'CORNER';
  const maxWidth = surfaceWidth * TILE_TEXT_SAFE_WIDTH_RATIO;
  const maxHeight = getTextAreaMaxHeight(panel, isCorner);
  if (tile.tileType === 'normal') {
    const normalizedName = name.trim();
    const lineCount = getPropertyLineCount(normalizedName);
    const fit = fitTileText({
      value: normalizedName,
      desiredLineCount: lineCount,
      desiredFontSize: NORMAL_TILE_TEXT_ONE_LINE_SIZE,
      twoLineFontSize: NORMAL_TILE_TEXT_TWO_LINE_SIZE,
      minFontSize: NORMAL_TILE_TEXT_MIN_SIZE,
      maxWidth,
      maxHeight,
      lineHeight: TILE_TEXT_LINE_HEIGHT,
    });
    return {
      value: fit.value,
      fontSize: fit.fontSize,
      maxWidth,
      maxHeight,
      lineHeight: TILE_TEXT_LINE_HEIGHT,
      positionZ: isCorner ? 0 : panel.footerCenterLocalZ,
      footer: !isCorner,
      region: isCorner ? 'corner' : 'footer',
      whiteSpace: 'nowrap',
    };
  }

  const label = tile.tileType === 'company' ? name.trim() : getSpecialTileLabel(tile.tileType);
  const lineCount = label.length > 14 ? 2 : 1;
  const cornerScale = isCorner ? 1.12 : 1;
  const fit = fitTileText({
    value: label,
    desiredLineCount: lineCount,
    desiredFontSize: SPECIAL_TILE_TEXT_ONE_LINE_SIZE * cornerScale,
    twoLineFontSize: SPECIAL_TILE_TEXT_TWO_LINE_SIZE * cornerScale,
    minFontSize: SPECIAL_TILE_TEXT_MIN_SIZE * cornerScale,
    maxWidth,
    maxHeight,
    lineHeight: TILE_TEXT_LINE_HEIGHT,
  });
  return {
    value: fit.value,
    fontSize: fit.fontSize,
    maxWidth,
    maxHeight,
    lineHeight: TILE_TEXT_LINE_HEIGHT,
    positionZ: isCorner
      ? 0
      : panel.footerCenterLocalZ,
    footer: !isCorner,
    region: isCorner ? 'corner' : 'footer',
    whiteSpace: 'nowrap',
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
        maxHeight={presentation.maxHeight}
        lineHeight={presentation.lineHeight}
        whiteSpace={presentation.whiteSpace}
        rotationZ={panel.contentRotationY}
      />
    </group>
  );
}

import { useMemo } from 'react';
import { TILE_SURFACE_CLEARANCE_Y } from '../board/boardLayout';
import { boardVisualTokens } from '../board/boardVisualTokens';
import MergedRoundedBoxes, { type MergedBoxSpec } from '../board/geometry/MergedRoundedBoxes';
import type { TilePanelLayout } from '../board/tiles/tilePanelLayout';

interface JailVisualProps {
  panel: TilePanelLayout;
}

export const JAIL_CORNER_WIDTH_RATIO = 0.72;
export const JAIL_CORNER_DEPTH_RATIO = 0.68;
export const JAIL_BAR_COUNT = 9;

/** Every part of the cell shares one metal material, so the cell is baked into a single mesh. */
export function createJailCellSpecs(panel: TilePanelLayout): MergedBoxSpec[] {
  const isCorner = panel.side === 'CORNER';
  const width = panel.upperSize[0] * (isCorner ? JAIL_CORNER_WIDTH_RATIO : 0.78);
  const depth = isCorner
    ? panel.upperSize[1] * JAIL_CORNER_DEPTH_RATIO
    : Math.min(panel.upperSize[1] * 0.68, 0.9);
  const barSpacing = width / (JAIL_BAR_COUNT - 1);
  const color = boardVisualTokens.jailBars;
  return [
    {
      width: width + 0.1, height: 0.024, depth: 0.08, radius: 0.018, color, position: [0, 0.022, depth / 2],
    },
    {
      width: width + 0.1, height: 0.024, depth: 0.08, radius: 0.018, color, position: [0, 0.022, -depth / 2],
    },
    ...Array.from({ length: JAIL_BAR_COUNT }, (_, index): MergedBoxSpec => ({
      width: 0.052,
      height: 0.032,
      depth,
      radius: 0.018,
      color,
      position: [(index - (JAIL_BAR_COUNT - 1) / 2) * barSpacing, 0.026, 0],
    })),
    {
      width: 0.07, height: 0.03, depth: depth + 0.08, radius: 0.02, color, position: [-width / 2, 0.025, 0],
    },
    {
      width: 0.07, height: 0.03, depth: depth + 0.08, radius: 0.02, color, position: [width / 2, 0.025, 0],
    },
  ];
}

export default function JailVisual({ panel }: JailVisualProps) {
  const isCorner = panel.side === 'CORNER';
  const specs = useMemo(() => createJailCellSpecs(panel), [panel]);

  return (
    <group
      name="JailCellBars2D"
      position={[0, TILE_SURFACE_CLEARANCE_Y + 0.014, isCorner ? 0 : panel.upperArtCenterLocalZ]}
      rotation={[0, panel.contentRotationY, 0]}
    >
      <MergedRoundedBoxes name="JailCellMerged" specs={specs} materialProfile="metal" />
    </group>
  );
}

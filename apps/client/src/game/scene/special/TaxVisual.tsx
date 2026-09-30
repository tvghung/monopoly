import { useMemo } from 'react';
import { TILE_SURFACE_CLEARANCE_Y } from '../board/boardLayout';
import { boardVisualTokens } from '../board/boardVisualTokens';
import MergedRoundedBoxes, { type MergedBoxSpec } from '../board/geometry/MergedRoundedBoxes';
import type { TilePanelLayout } from '../board/tiles/tilePanelLayout';

interface TaxVisualProps {
  panel: TilePanelLayout;
}

export const TAX_ART_SAFE_WIDTH_RATIO = 0.78;
export const TAX_ART_SAFE_DEPTH_RATIO = 0.58;
export const TAX_BACK_PAPER_COLOR = '#b7c0be';
export const TAX_PLACEHOLDER_LINE_COUNT = 5;

/** Two paper sheets (board-top material) and five ink marks (trim material): two merged meshes. */
export function createTaxVisualSpecs(panel: TilePanelLayout): { papers: MergedBoxSpec[]; marks: MergedBoxSpec[] } {
  const paperWidth = panel.upperSize[0] * TAX_ART_SAFE_WIDTH_RATIO;
  const paperDepth = panel.upperSize[1] * TAX_ART_SAFE_DEPTH_RATIO;
  const lineWidth = paperWidth * 0.38;
  const mark = (widthScale: number, x: number, y: number, z: number): MergedBoxSpec => ({
    width: lineWidth * widthScale,
    height: 0.016,
    depth: 0.028,
    radius: 0.012,
    color: boardVisualTokens.expenseDark,
    position: [x, y, z],
  });
  return {
    papers: [
      {
        width: paperWidth * 0.94,
        height: 0.035,
        depth: paperDepth * 0.94,
        radius: 0.035,
        color: TAX_BACK_PAPER_COLOR,
        position: [-paperWidth * 0.05, 0.025, paperDepth * 0.06],
        rotation: [0, -0.08, 0],
      },
      {
        width: paperWidth,
        height: 0.04,
        depth: paperDepth,
        radius: 0.03,
        color: '#fffdf3',
        position: [paperWidth * 0.05, 0.06, -paperDepth * 0.04],
        rotation: [0, 0.06, 0],
      },
    ],
    marks: [
      mark(1, -paperWidth * 0.13, 0.092, -paperDepth * 0.25),
      mark(0.84, -paperWidth * 0.08, 0.094, -paperDepth * 0.14),
      mark(1, -paperWidth * 0.12, 0.096, -paperDepth * 0.03),
      mark(0.72, -paperWidth * 0.07, 0.098, paperDepth * 0.08),
      mark(0.9, -paperWidth * 0.13, 0.1, paperDepth * 0.19),
    ],
  };
}

export default function TaxVisual({ panel }: TaxVisualProps) {
  const specs = useMemo(() => createTaxVisualSpecs(panel), [panel]);

  return (
    <group
      name="TaxVisual"
      position={[0, TILE_SURFACE_CLEARANCE_Y + 0.016, panel.upperArtCenterLocalZ]}
      rotation={[0, panel.contentRotationY, 0]}
      userData={{ artWidthRatio: TAX_ART_SAFE_WIDTH_RATIO, artDepthRatio: TAX_ART_SAFE_DEPTH_RATIO }}
    >
      <MergedRoundedBoxes name="TaxPapers" specs={specs.papers} materialProfile="boardTop" />
      <MergedRoundedBoxes name="TaxPaperMarks" specs={specs.marks} materialProfile="propertyTrim" />
    </group>
  );
}

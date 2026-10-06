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
/**
 * The stack is a flat print, not a raised prop: a mascot always stands at the tile centre on its round base (0.05 high, plan
 * 05 §8.4) and the stack covers that centre, so any part of it taller than the base would hide the player's coloured base on
 * a tax tile. Sheets and marks are thin layers that overlap by `TAX_LAYER_OVERLAP`, and the whole art ends below the shallow
 * SVG badge face of the railroad, utility and card-deck tiles (`TILE_ICON_FACE_Y_OFFSET`).
 */
export const TAX_BACK_SHEET_THICKNESS = 0.008;
export const TAX_FRONT_SHEET_THICKNESS = 0.01;
export const TAX_MARK_THICKNESS = 0.006;
export const TAX_LAYER_OVERLAP = 0.001;
/** Height of the art group's origin in the tile frame; every box position in the specs is measured from here. */
export const TAX_ART_ORIGIN_Y = TILE_SURFACE_CLEARANCE_Y;

const TAX_BACK_SHEET_CENTER_Y = TAX_BACK_SHEET_THICKNESS / 2;
const TAX_FRONT_SHEET_BOTTOM_Y = TAX_BACK_SHEET_THICKNESS - TAX_LAYER_OVERLAP;
const TAX_FRONT_SHEET_CENTER_Y = TAX_FRONT_SHEET_BOTTOM_Y + TAX_FRONT_SHEET_THICKNESS / 2;
const TAX_MARK_BOTTOM_Y = TAX_FRONT_SHEET_BOTTOM_Y + TAX_FRONT_SHEET_THICKNESS - TAX_LAYER_OVERLAP;
const TAX_MARK_CENTER_Y = TAX_MARK_BOTTOM_Y + TAX_MARK_THICKNESS / 2;

/** Two flat paper sheets (board-top material) and five ink marks (trim material): two merged meshes. */
export function createTaxVisualSpecs(panel: TilePanelLayout): { papers: MergedBoxSpec[]; marks: MergedBoxSpec[] } {
  const paperWidth = panel.upperSize[0] * TAX_ART_SAFE_WIDTH_RATIO;
  const paperDepth = panel.upperSize[1] * TAX_ART_SAFE_DEPTH_RATIO;
  const lineWidth = paperWidth * 0.38;
  const mark = (widthScale: number, x: number, z: number): MergedBoxSpec => ({
    width: lineWidth * widthScale,
    height: TAX_MARK_THICKNESS,
    depth: 0.028,
    radius: TAX_MARK_THICKNESS / 2,
    color: boardVisualTokens.expenseDark,
    position: [x, TAX_MARK_CENTER_Y, z],
  });
  return {
    papers: [
      {
        width: paperWidth * 0.94,
        height: TAX_BACK_SHEET_THICKNESS,
        depth: paperDepth * 0.94,
        radius: TAX_BACK_SHEET_THICKNESS / 2,
        color: TAX_BACK_PAPER_COLOR,
        position: [-paperWidth * 0.05, TAX_BACK_SHEET_CENTER_Y, paperDepth * 0.06],
        rotation: [0, -0.08, 0],
      },
      {
        width: paperWidth,
        height: TAX_FRONT_SHEET_THICKNESS,
        depth: paperDepth,
        radius: TAX_FRONT_SHEET_THICKNESS / 2,
        color: '#fffdf3',
        position: [paperWidth * 0.05, TAX_FRONT_SHEET_CENTER_Y, -paperDepth * 0.04],
        rotation: [0, 0.06, 0],
      },
    ],
    marks: [
      mark(1, -paperWidth * 0.13, -paperDepth * 0.25),
      mark(0.84, -paperWidth * 0.08, -paperDepth * 0.14),
      mark(1, -paperWidth * 0.12, -paperDepth * 0.03),
      mark(0.72, -paperWidth * 0.07, paperDepth * 0.08),
      mark(0.9, -paperWidth * 0.13, paperDepth * 0.19),
    ],
  };
}

export default function TaxVisual({ panel }: TaxVisualProps) {
  const specs = useMemo(() => createTaxVisualSpecs(panel), [panel]);

  return (
    <group
      name="TaxVisual"
      position={[0, TAX_ART_ORIGIN_Y, panel.upperArtCenterLocalZ]}
      rotation={[0, panel.contentRotationY, 0]}
      userData={{ artWidthRatio: TAX_ART_SAFE_WIDTH_RATIO, artDepthRatio: TAX_ART_SAFE_DEPTH_RATIO }}
    >
      <MergedRoundedBoxes name="TaxPapers" specs={specs.papers} materialProfile="boardTop" />
      <MergedRoundedBoxes name="TaxPaperMarks" specs={specs.marks} materialProfile="propertyTrim" />
    </group>
  );
}

import { TILE_SURFACE_CLEARANCE_Y } from '../board/boardLayout';
import { boardVisualTokens } from '../board/boardVisualTokens';
import RoundedBoxMesh from '../board/geometry/RoundedBoxMesh';
import type { TilePanelLayout } from '../board/tiles/tilePanelLayout';

interface TaxVisualProps {
  panel: TilePanelLayout;
}

export const TAX_ART_SAFE_WIDTH_RATIO = 0.82;
export const TAX_ART_SAFE_DEPTH_RATIO = 0.62;

export default function TaxVisual({ panel }: TaxVisualProps) {
  const paperWidth = panel.upperSize[0] * TAX_ART_SAFE_WIDTH_RATIO;
  const paperDepth = panel.upperSize[1] * TAX_ART_SAFE_DEPTH_RATIO;
  const lineWidth = paperWidth * 0.42;

  return (
    <group
      name="TaxVisual"
      position={[0, TILE_SURFACE_CLEARANCE_Y + 0.016, panel.upperArtCenterLocalZ]}
      rotation={[0, panel.contentRotationY, 0]}
      userData={{ artWidthRatio: TAX_ART_SAFE_WIDTH_RATIO, artDepthRatio: TAX_ART_SAFE_DEPTH_RATIO }}
    >
      <RoundedBoxMesh
        name="TaxPaperBack"
        width={paperWidth * 0.94}
        height={0.035}
        depth={paperDepth * 0.94}
        radius={0.035}
        color="#d9e1dd"
        materialProfile="boardTop"
        position={[-paperWidth * 0.06, 0.025, paperDepth * 0.07]}
        rotation={[0, -0.08, 0]}
      />
      <RoundedBoxMesh
        name="TaxPaperFront"
        width={paperWidth}
        height={0.04}
        depth={paperDepth}
        radius={0.035}
        color="#fffdf3"
        materialProfile="boardTop"
        position={[paperWidth * 0.06, 0.06, -paperDepth * 0.05]}
        rotation={[0, 0.06, 0]}
      />
      <RoundedBoxMesh
        name="TaxPaperMarkTop"
        width={lineWidth}
        height={0.016}
        depth={0.028}
        radius={0.012}
        color={boardVisualTokens.expenseDark}
        materialProfile="propertyTrim"
        position={[-paperWidth * 0.16, 0.092, -paperDepth * 0.2]}
      />
      <RoundedBoxMesh
        name="TaxPaperMarkMiddle"
        width={lineWidth * 0.76}
        height={0.016}
        depth={0.028}
        radius={0.012}
        color={boardVisualTokens.expenseDark}
        materialProfile="propertyTrim"
        position={[-paperWidth * 0.11, 0.094, -paperDepth * 0.02]}
      />
      <RoundedBoxMesh
        name="TaxPaperMarkBottom"
        width={lineWidth * 1.16}
        height={0.016}
        depth={0.028}
        radius={0.012}
        color={boardVisualTokens.expenseDark}
        materialProfile="propertyTrim"
        position={[-paperWidth * 0.17, 0.096, paperDepth * 0.18]}
      />
    </group>
  );
}

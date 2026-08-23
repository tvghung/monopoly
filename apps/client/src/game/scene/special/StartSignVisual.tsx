import { useEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { Text } from 'troika-three-text';
import * as THREE from 'three';
import { BOARD_FONT_URL } from '../../../design-system/typography/gameFonts';
import { getBoardTileLayout, TILE_SURFACE_CLEARANCE_Y } from '../board/boardLayout';
import { boardVisualTokens } from '../board/boardVisualTokens';
import RoundedBoxMesh from '../board/geometry/RoundedBoxMesh';
import {
  getOrientedTilePanelLayoutForTileSize,
  type TilePanelLayout,
} from '../board/tiles/tilePanelLayout';

interface StartSignVisualProps {
  panel: TilePanelLayout;
}

export const START_SIGN_LABEL = 'Start';
export const START_SIGN_TRAVEL_ROTATION_Y = getBoardTileLayout(0)?.rotation[1] ?? 0;
export const START_SIGN_NATIVE_WIDTH = 1.55;
export const START_SIGN_TARGET_WIDTH_RATIO = 0.82;
export const START_SIGN_HEIGHT_SCALE = 1.2;

export function getStartSignWidthScale(panel: TilePanelLayout): number {
  return panel.surfaceSize[0] * START_SIGN_TARGET_WIDTH_RATIO / START_SIGN_NATIVE_WIDTH;
}

const START_CORNER_PANEL = getBoardTileLayout(0)
  ? getOrientedTilePanelLayoutForTileSize(getBoardTileLayout(0)!.size, 'CORNER')
  : null;
export const START_SIGN_WIDTH_SCALE = START_CORNER_PANEL
  ? getStartSignWidthScale(START_CORNER_PANEL)
  : 1;

export function createStartSignGeometry(): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-0.78, 0);
  shape.lineTo(-0.48, 0.3);
  shape.lineTo(-0.48, 0.16);
  shape.lineTo(0.72, 0.16);
  shape.quadraticCurveTo(0.77, 0.16, 0.77, 0.1);
  shape.lineTo(0.77, -0.1);
  shape.quadraticCurveTo(0.77, -0.16, 0.72, -0.16);
  shape.lineTo(-0.48, -0.16);
  shape.lineTo(-0.48, -0.3);
  shape.closePath();
  return new THREE.ExtrudeGeometry(shape, {
    depth: 0.09,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: 0.018,
    bevelThickness: 0.012,
    curveSegments: 4,
  });
}

function StartSignText() {
  const invalidate = useThree(state => state.invalidate);
  const textObjectRef = useRef<Text | null>(null);
  if (!textObjectRef.current) textObjectRef.current = new Text();
  const textObject = textObjectRef.current;

  useEffect(() => {
    textObject.text = START_SIGN_LABEL;
    textObject.font = BOARD_FONT_URL;
    textObject.fontSize = 0.44;
    textObject.maxWidth = 0.96;
    textObject.anchorX = 'center';
    textObject.anchorY = 'middle';
    textObject.textAlign = 'center';
    textObject.color = boardVisualTokens.startSignText;
    textObject.renderOrder = 10;
    textObject.sync(invalidate);
  }, [invalidate, textObject]);

  useEffect(() => () => textObject.dispose(), [textObject]);

  return (
    <primitive
      object={textObject}
      name="StartSignText"
      position={[0.08, 0.5, 0.12]}
    />
  );
}

export default function StartSignVisual({ panel }: StartSignVisualProps) {
  const geometry = useMemo(() => createStartSignGeometry(), []);
  const widthScale = getStartSignWidthScale(panel);
  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <group
      name="StartSignVisual"
      position={[0, TILE_SURFACE_CLEARANCE_Y, 0]}
      rotation={[0, START_SIGN_TRAVEL_ROTATION_Y + panel.contentRotationY, 0]}
      scale={[widthScale, START_SIGN_HEIGHT_SCALE, widthScale]}
      userData={{
        label: START_SIGN_LABEL,
        points: 'tile-0-travel-left',
        visualScale: [widthScale, START_SIGN_HEIGHT_SCALE],
        usableCornerWidth: panel.surfaceSize[0],
        targetWidthRatio: START_SIGN_TARGET_WIDTH_RATIO,
      }}
    >
      <RoundedBoxMesh
        name="StartSignPostLeft"
        width={0.11}
        height={0.46}
        depth={0.11}
        radius={0.025}
        color={boardVisualTokens.startSignSide}
        materialProfile="propertyTrim"
        position={[-0.42, 0.22, 0]}
      />
      <RoundedBoxMesh
        name="StartSignPostRight"
        width={0.11}
        height={0.46}
        depth={0.11}
        radius={0.025}
        color={boardVisualTokens.startSignSide}
        materialProfile="propertyTrim"
        position={[0.42, 0.22, 0]}
      />
      <mesh name="StartArrowSign" geometry={geometry} position={[0, 0.5, 0]}>
        <meshStandardMaterial color={boardVisualTokens.startSignFace} roughness={0.38} metalness={0.04} />
      </mesh>
      <StartSignText />
    </group>
  );
}

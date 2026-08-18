import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import {
  BOARD_FOUNDATION_BEVEL,
  BOARD_FOUNDATION_HEIGHT,
  BOARD_LOWER_CHASSIS_HEIGHT,
  BOARD_TOP_DECK_HEIGHT,
  BOARD_CENTER_INSET,
} from '../architecture/boardArtSpec';
import {
  CENTER_PLATFORM_SIZE,
} from '../boardLayout';
import { boardVisualTokens } from '../boardVisualTokens';
import RoundedBoxMesh from '../geometry/RoundedBoxMesh';
import BoardFrame from './BoardFrame';
import TileSocket from './TileSocket';
import {
  createOuterBoardAccentGeometry,
  FOUNDATION_SIZE,
  OUTER_BOARD_ACCENT_LIFT_Y,
} from './outerBoardAccent';

const SIDE_WALL_HEIGHT = BOARD_FOUNDATION_HEIGHT - BOARD_LOWER_CHASSIS_HEIGHT - BOARD_TOP_DECK_HEIGHT;

function FoundationOuterAccentLoop() {
  const geometry = useMemo(() => createOuterBoardAccentGeometry(), []);
  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <mesh
      name="FoundationOuterAccentLoop"
      geometry={geometry}
      position={[0, BOARD_FOUNDATION_HEIGHT + OUTER_BOARD_ACCENT_LIFT_Y, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      userData={{ continuous: true, closed: true, band: 'near-white-neutral' }}
    >
      <meshStandardMaterial
        color={boardVisualTokens.boardOuterAccent}
        roughness={0.6}
        metalness={0}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

export default function BoardFoundation() {
  return (
    <group name="BoardFoundation">
      <RoundedBoxMesh
        name="LowerChassis"
        width={FOUNDATION_SIZE + 0.16}
        height={BOARD_LOWER_CHASSIS_HEIGHT}
        depth={FOUNDATION_SIZE + 0.16}
        radius={BOARD_FOUNDATION_BEVEL}
        color={boardVisualTokens.boardBaseEdge}
        materialProfile="boardEdge"
        position={[0, BOARD_LOWER_CHASSIS_HEIGHT / 2, 0]}
      />
      <FoundationOuterAccentLoop />
      <RoundedBoxMesh
        name="MutedSideWall"
        width={FOUNDATION_SIZE}
        height={SIDE_WALL_HEIGHT}
        depth={FOUNDATION_SIZE}
        radius={BOARD_FOUNDATION_BEVEL * 0.8}
        color={boardVisualTokens.boardBase}
        materialProfile="boardBody"
        position={[0, BOARD_LOWER_CHASSIS_HEIGHT + SIDE_WALL_HEIGHT / 2, 0]}
      />
      <RoundedBoxMesh
        name="TopDeck"
        width={FOUNDATION_SIZE - 0.1}
        height={BOARD_TOP_DECK_HEIGHT}
        depth={FOUNDATION_SIZE - 0.1}
        radius={BOARD_FOUNDATION_BEVEL * 0.7}
        color={boardVisualTokens.boardTop}
        materialProfile="boardTop"
        position={[0, BOARD_FOUNDATION_HEIGHT - BOARD_TOP_DECK_HEIGHT / 2, 0]}
      />
      <RoundedBoxMesh
        name="CenterInsetPlatform"
        width={CENTER_PLATFORM_SIZE - BOARD_CENTER_INSET}
        height={0.05}
        depth={CENTER_PLATFORM_SIZE - BOARD_CENTER_INSET}
        radius={0.06}
        color={boardVisualTokens.boardCenter}
        materialProfile="centerWell"
        position={[0, BOARD_FOUNDATION_HEIGHT + 0.015, 0]}
      />
      <BoardFrame />
      <TileSocket />
    </group>
  );
}

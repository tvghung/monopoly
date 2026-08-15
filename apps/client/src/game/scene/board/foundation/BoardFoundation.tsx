import {
  BOARD_FOUNDATION_BEVEL,
  BOARD_FOUNDATION_HEIGHT,
  BOARD_LOWER_CHASSIS_HEIGHT,
  BOARD_TOP_DECK_HEIGHT,
  BOARD_CENTER_INSET,
} from '../architecture/boardArtSpec';
import {
  INNER_SIDE_BOUNDARY,
  OUTER_BOARD_SIZE,
} from '../boardLayout';
import { boardVisualTokens } from '../boardVisualTokens';
import RoundedBoxMesh from '../geometry/RoundedBoxMesh';
import BoardFrame from './BoardFrame';
import TileSocket from './TileSocket';

const FOUNDATION_SIZE = OUTER_BOARD_SIZE + 0.72;
const CENTER_SIZE = INNER_SIDE_BOUNDARY * 2;
const SIDE_WALL_HEIGHT = BOARD_FOUNDATION_HEIGHT - BOARD_LOWER_CHASSIS_HEIGHT - BOARD_TOP_DECK_HEIGHT;

function FoundationAccentInlays() {
  const accentsRef = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const accents = accentsRef.current;
    if (!accents) return;
    const dummy = new THREE.Object3D();
    const extent = FOUNDATION_SIZE / 2 - 0.16;
    const length = FOUNDATION_SIZE - 0.8;
    [
      [0, -extent, 0],
      [0, extent, 0],
      [-extent, 0, Math.PI / 2],
      [extent, 0, Math.PI / 2],
    ].forEach(([x, z, rotationY], index) => {
      dummy.position.set(x, BOARD_FOUNDATION_HEIGHT + 0.008, z);
      dummy.rotation.set(0, rotationY, 0);
      dummy.scale.set(length, 0.012, 0.055);
      dummy.updateMatrix();
      accents.setMatrixAt(index, dummy.matrix);
    });
    accents.instanceMatrix.needsUpdate = true;
  }, []);

  return (
    <instancedMesh ref={accentsRef} args={[undefined, undefined, 4]} name="FoundationAccentInlays">
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color={boardVisualTokens.boardAccent} roughness={0.5} metalness={0.02} />
    </instancedMesh>
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
      <FoundationAccentInlays />
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
        width={CENTER_SIZE - BOARD_CENTER_INSET}
        height={0.05}
        depth={CENTER_SIZE - BOARD_CENTER_INSET}
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
import { useEffect, useRef } from 'react';
import * as THREE from 'three';

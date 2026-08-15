import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import {
  BOARD_FOUNDATION_HEIGHT,
  TILE_SOCKET_BEVEL,
  TILE_SOCKET_DEPTH,
  TILE_SOCKET_LIP_HEIGHT,
} from '../architecture/boardArtSpec';
import { EDGE_TILE_DEPTH, EDGE_TILE_WIDTH, CORNER_SIZE, TILE_GAP, boardLayout } from '../boardLayout';
import { boardVisualTokens } from '../boardVisualTokens';

const SIDE_SOCKET_LAYOUTS = boardLayout.filter(layout => layout.side !== 'CORNER');
const CORNER_SOCKET_LAYOUTS = boardLayout.filter(layout => layout.side === 'CORNER');
const SIDE_SOCKET_SIZE = [EDGE_TILE_WIDTH - TILE_GAP, EDGE_TILE_DEPTH - TILE_GAP] as const;
const CORNER_SOCKET_SIZE = [CORNER_SIZE - TILE_GAP, CORNER_SIZE - TILE_GAP] as const;

function useSocketGeometry(size: readonly [number, number]) {
  return useMemo(
    () => new RoundedBoxGeometry(size[0] + 0.1, TILE_SOCKET_DEPTH, size[1] + 0.1, 2, TILE_SOCKET_BEVEL),
    [size],
  );
}

function populateSockets(
  mesh: THREE.InstancedMesh,
  layouts: typeof boardLayout,
): void {
  const dummy = new THREE.Object3D();
  layouts.forEach((layout, index) => {
    dummy.position.set(
      layout.position[0],
      BOARD_FOUNDATION_HEIGHT + TILE_SOCKET_LIP_HEIGHT - TILE_SOCKET_DEPTH / 2,
      layout.position[2],
    );
    dummy.rotation.set(0, layout.rotation[1], 0);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
}

export function TileSocketAnchor({ tileId }: { tileId: number }) {
  return (
    <group
      name={`TileSocket:${tileId}`}
      userData={{ tileId, batch: 'TileSocketLayer' }}
    />
  );
}

export default function TileSocket() {
  const sideRef = useRef<THREE.InstancedMesh>(null);
  const cornerRef = useRef<THREE.InstancedMesh>(null);
  const sideGeometry = useSocketGeometry(SIDE_SOCKET_SIZE);
  const cornerGeometry = useSocketGeometry(CORNER_SOCKET_SIZE);

  useEffect(() => {
    if (sideRef.current) populateSockets(sideRef.current, SIDE_SOCKET_LAYOUTS);
    if (cornerRef.current) populateSockets(cornerRef.current, CORNER_SOCKET_LAYOUTS);
  }, []);

  useEffect(() => () => {
    sideGeometry.dispose();
    cornerGeometry.dispose();
  }, [cornerGeometry, sideGeometry]);

  return (
    <group name="TileSocketLayer" userData={{ socketCount: boardLayout.length }}>
      <instancedMesh ref={sideRef} args={[undefined, undefined, SIDE_SOCKET_LAYOUTS.length]} name="TileSocketsSide">
        <primitive object={sideGeometry} attach="geometry" />
        <meshStandardMaterial color={boardVisualTokens.tileSocket} roughness={0.44} metalness={0.04} />
      </instancedMesh>
      <instancedMesh ref={cornerRef} args={[undefined, undefined, CORNER_SOCKET_LAYOUTS.length]} name="TileSocketsCorner">
        <primitive object={cornerGeometry} attach="geometry" />
        <meshStandardMaterial color={boardVisualTokens.tileSocket} roughness={0.44} metalness={0.04} />
      </instancedMesh>
    </group>
  );
}

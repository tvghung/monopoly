import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { TILE_SURFACE_CLEARANCE_Y, TILE_SURFACE_Y } from '../boardLayout';
import { boardVisualTokens } from '../boardVisualTokens';
import { getPlayerDisplayColor } from '../../../ui/playerVisualColors';
import type { TilePanelLayout } from './tilePanelLayout';

export const OWNERSHIP_FLAG_POLE_HEIGHT = 0.36;
export const OWNERSHIP_FLAG_POLE_WIDTH = 0.035;
export const OWNERSHIP_FLAG_CLOTH_WIDTH = 0.3;
export const OWNERSHIP_FLAG_CLOTH_HEIGHT = 0.16;
export const OWNERSHIP_FLAG_CLOTH_DEPTH = 0.028;
const OWNERSHIP_FLAG_LATERAL_INSET = 0.16;
const OWNERSHIP_FLAG_OUTER_INSET_RATIO = 0.08;

function appendBoxVertices(
  positions: number[],
  colors: number[],
  size: readonly [number, number, number],
  center: readonly [number, number, number],
  color: THREE.Color,
): void {
  const indexedSource = new THREE.BoxGeometry(...size);
  const source = indexedSource.toNonIndexed();
  indexedSource.dispose();
  const position = source.getAttribute('position');
  for (let index = 0; index < position.count; index += 1) {
    positions.push(
      position.getX(index) + center[0],
      position.getY(index) + center[1],
      position.getZ(index) + center[2],
    );
    colors.push(color.r, color.g, color.b);
  }
  source.dispose();
}

function createOwnershipFlagGeometry(clothColor: string): THREE.BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  appendBoxVertices(
    positions,
    colors,
    [OWNERSHIP_FLAG_POLE_WIDTH, OWNERSHIP_FLAG_POLE_HEIGHT, OWNERSHIP_FLAG_POLE_WIDTH],
    [0, OWNERSHIP_FLAG_POLE_HEIGHT / 2, 0],
    new THREE.Color(boardVisualTokens.tileDivider),
  );
  appendBoxVertices(
    positions,
    colors,
    [OWNERSHIP_FLAG_CLOTH_WIDTH, OWNERSHIP_FLAG_CLOTH_HEIGHT, OWNERSHIP_FLAG_CLOTH_DEPTH],
    [
      OWNERSHIP_FLAG_POLE_WIDTH / 2 + OWNERSHIP_FLAG_CLOTH_WIDTH / 2,
      OWNERSHIP_FLAG_POLE_HEIGHT * 0.7,
      0,
    ],
    new THREE.Color(clothColor),
  );

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

export interface OwnershipFlagPlacement {
  position: readonly [number, number, number];
  outerInset: number;
}

export function getOwnershipFlagClothColor(ownerColor: string): string {
  return getPlayerDisplayColor(ownerColor);
}

export function getOwnershipFlagPlacement(panel: TilePanelLayout): OwnershipFlagPlacement {
  const lateralInset = Math.min(
    OWNERSHIP_FLAG_LATERAL_INSET,
    panel.surfaceSize[0] * 0.2,
  );
  const outerInset = Math.max(
    OWNERSHIP_FLAG_CLOTH_DEPTH,
    panel.upperSize[1] * OWNERSHIP_FLAG_OUTER_INSET_RATIO,
  );
  return {
    position: [
      -panel.surfaceSize[0] / 2 + lateralInset,
      TILE_SURFACE_CLEARANCE_Y,
      panel.upperOuterBoundaryLocalZ + panel.flowSign * outerInset,
    ],
    outerInset,
  };
}

interface OwnershipFlagProps {
  ownerColor: string;
  panel: TilePanelLayout;
}

export default function OwnershipFlag({ ownerColor, panel }: OwnershipFlagProps) {
  const displayColor = getOwnershipFlagClothColor(ownerColor);
  const placement = getOwnershipFlagPlacement(panel);
  const geometry = useMemo(
    () => createOwnershipFlagGeometry(displayColor),
    [displayColor],
  );

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <group
      name="OwnershipFlag"
      position={placement.position}
      userData={{
        ownerColor,
        displayColor,
        placement: 'tile-local-upper-outer',
        geometryParts: ['FlagPole', 'FlagCloth'],
        drawCalls: 1,
        surfaceY: TILE_SURFACE_Y,
        panelSide: panel.side,
        panelFlowSign: panel.flowSign,
      }}
    >
      <mesh
        name="FlagPoleAndCloth"
        geometry={geometry}
      >
        <meshStandardMaterial vertexColors color="#ffffff" roughness={0.68} metalness={0.02} />
      </mesh>
    </group>
  );
}

import type { Tile } from '@monopoly/shared';
import type { ThreeEvent } from '@react-three/fiber';
import { useEffect, useState } from 'react';
import type { CanvasTexture } from 'three';
import {
  PLATFORM_HEIGHT,
  SURFACE_EPSILON,
  TILE_HEIGHT,
  TILE_SURFACE_Y,
  getBoardTileLayout,
} from './boardLayout';
import { boardVisualTokens } from './boardVisualTokens';
import {
  acquireTileLabelTexture,
  getTileAccentColor,
  getTileLabelScale,
  releaseTileLabelTexture,
} from './tileTexture';
import JailVisual from '../special/JailVisual';
import CardDeckVisual from '../special/CardDeckVisual';
import BuildingLayer from '../buildings/BuildingLayer';
import OwnershipMarker from './OwnershipMarker';
import SelectionMarker from './SelectionMarker';

export interface BoardTile3DProps {
  tileId: number;
  tile: Tile;
  hovered?: boolean;
  selected?: boolean;
  ownerColor?: string;
  houses?: number;
  onHover?: (tileId: number | null) => void;
  onSelect?: (tileId: number) => void;
}

function stopPointerEvent(event: { stopPropagation: () => void }): void {
  event.stopPropagation();
}

function useTileLabelTexture(
  tileId: number,
  tile: Tile,
  enabled: boolean,
): CanvasTexture | null {
  const [texture, setTexture] = useState<CanvasTexture | null>(null);
  useEffect(() => {
    if (!enabled) {
      setTexture(null);
      return undefined;
    }
    const acquiredTexture = acquireTileLabelTexture(tileId, tile);
    setTexture(acquiredTexture);
    return () => releaseTileLabelTexture(tileId);
  }, [enabled, tile, tileId]);
  return texture;
}

export default function BoardTile3D({
  tileId,
  tile,
  hovered = false,
  selected = false,
  ownerColor,
  houses = 0,
  onHover,
  onSelect,
}: BoardTile3DProps) {
  const layout = getBoardTileLayout(tileId);
  const texture = useTileLabelTexture(tileId, tile, Boolean(layout));

  if (!layout || !texture) return null;
  const slabColor = selected
    ? boardVisualTokens.selection
    : hovered ? boardVisualTokens.hover : boardVisualTokens.tileSurface;
  const stripPosition = [
    0,
    TILE_SURFACE_Y + SURFACE_EPSILON + 0.0225,
    layout.size[1] / 2 - 0.11,
  ] as const;
  const accent = getTileAccentColor(tile);
  const handlePointerEnter = (event: ThreeEvent<PointerEvent>) => {
    stopPointerEvent(event);
    onHover?.(tileId);
  };
  const handlePointerLeave = (event: ThreeEvent<PointerEvent>) => {
    stopPointerEvent(event);
    onHover?.(null);
  };
  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    stopPointerEvent(event);
    onSelect?.(tileId);
  };

  return (
    <group position={layout.position}>
      <group rotation={layout.rotation}>
        <mesh
          position={[0, PLATFORM_HEIGHT + TILE_HEIGHT / 2, 0]}
          receiveShadow
          onPointerEnter={handlePointerEnter}
          onPointerLeave={handlePointerLeave}
          onClick={handleClick}
        >
          <boxGeometry args={[layout.size[0], TILE_HEIGHT, layout.size[1]]} />
          <meshStandardMaterial color={slabColor} roughness={0.76} metalness={0} />
        </mesh>
        {tile.color || tile.tileType !== 'normal'
          ? (
            <mesh
              position={stripPosition}
              receiveShadow
              onPointerDown={stopPointerEvent}
              onClick={handleClick}
            >
              <boxGeometry args={[layout.size[0], 0.045, 0.19]} />
              <meshStandardMaterial color={accent} roughness={0.7} />
            </mesh>
          )
          : null}
        {tile.tileType === 'jail' ? <JailVisual size={layout.size} /> : null}
        {tile.tileType === 'chance' || tile.tileType === 'chest'
          ? <CardDeckVisual size={layout.size} kind={tile.tileType} />
          : null}
        {ownerColor
          ? <OwnershipMarker color={ownerColor} size={layout.size} />
          : null}
        {selected ? <SelectionMarker size={layout.size} /> : null}
        {houses > 0 ? <BuildingLayer houses={houses} /> : null}
      </group>
      <sprite
        position={[0, TILE_SURFACE_Y + 0.09, 0]}
        scale={getTileLabelScale(tile)}
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
        onClick={handleClick}
      >
        <spriteMaterial map={texture} transparent depthWrite={false} />
      </sprite>
    </group>
  );
}

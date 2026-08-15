import type { Tile } from '@monopoly/shared';
import type { ThreeEvent } from '@react-three/fiber';
import { useEffect, useState } from 'react';
import type { CanvasTexture } from 'three';
import {
  PLATFORM_HEIGHT,
  TILE_HEIGHT,
  getTileSurfaceGeometry,
  getBoardTileLayout,
} from './boardLayout';
import { boardVisualTokens } from './boardVisualTokens';
import {
  acquireTileLabelTexture,
  DEFAULT_TILE_TEXTURE_ANISOTROPY,
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
  textureAnisotropy?: number;
  onHover?: (tileId: number | null) => void;
  onSelect?: (tileId: number) => void;
}

function stopPointerEvent(event: { stopPropagation: () => void }): void {
  event.stopPropagation();
}

export function useTileLabelTexture(
  tileId: number,
  tile: Tile,
  enabled: boolean,
  maxSupportedAnisotropy = DEFAULT_TILE_TEXTURE_ANISOTROPY,
): CanvasTexture | null {
  const [texture, setTexture] = useState<CanvasTexture | null>(null);
  useEffect(() => {
    if (!enabled) {
      setTexture(null);
      return undefined;
    }
    const acquiredTexture = acquireTileLabelTexture(tileId, tile, maxSupportedAnisotropy);
    setTexture(acquiredTexture);
    return () => releaseTileLabelTexture(tileId);
  }, [enabled, maxSupportedAnisotropy, tile, tileId]);
  return texture;
}

export default function BoardTile3D({
  tileId,
  tile,
  hovered = false,
  selected = false,
  ownerColor,
  houses = 0,
  textureAnisotropy = DEFAULT_TILE_TEXTURE_ANISOTROPY,
  onHover,
  onSelect,
}: BoardTile3DProps) {
  const layout = getBoardTileLayout(tileId);
  const texture = useTileLabelTexture(
    tileId,
    tile,
    Boolean(layout),
    textureAnisotropy,
  );

  if (!layout || !texture) return null;
  const surface = getTileSurfaceGeometry(layout);
  const slabColor = selected
    ? boardVisualTokens.selection
    : hovered ? boardVisualTokens.hover : boardVisualTokens.tileSurface;
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
          onPointerEnter={handlePointerEnter}
          onPointerLeave={handlePointerLeave}
          onClick={handleClick}
        >
          <boxGeometry args={[layout.size[0], TILE_HEIGHT, layout.size[1]]} />
          <meshStandardMaterial color={slabColor} roughness={0.76} metalness={0} />
        </mesh>
        {tile.tileType === 'jail' ? <JailVisual size={layout.size} /> : null}
        {tile.tileType === 'chance' || tile.tileType === 'chest'
          ? <CardDeckVisual size={layout.size} kind={tile.tileType} />
          : null}
        {ownerColor
          ? <OwnershipMarker color={ownerColor} size={layout.size} />
          : null}
        {selected ? <SelectionMarker size={layout.size} /> : null}
        {houses > 0 ? <BuildingLayer houses={houses} /> : null}
        <mesh
          position={surface.position}
          rotation={surface.rotation}
          onPointerEnter={handlePointerEnter}
          onPointerLeave={handlePointerLeave}
          onClick={handleClick}
        >
          <planeGeometry args={surface.size} />
          <meshBasicMaterial map={texture} toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}

import type { Tile } from '@monopoly/shared';
import type {
  DevelopmentChangeSignal,
  GoCrossingSignal,
  OwnershipChangeSignal,
} from '../../../presentation/store/types';
import { getBoardTileLayout } from '../boardLayout';
import { TILE_ASSEMBLY_LAYER_ORDER, TILE_TRANSFORM_CONTRACT } from '../architecture/tileAssemblyContracts';
import { boardVisualTokens } from '../boardVisualTokens';
import { TileSocketAnchor } from '../foundation/TileSocket';
import TileFxAnchor from './TileFxAnchor';
import TileBodyLayer from './TileBodyLayer';
import TileDevelopmentLayer from './TileDevelopmentLayer';
import TileInteractionLayer from './TileInteractionLayer';
import TileOwnershipLayer from './TileOwnershipLayer';
import TilePressRoot from './TilePressRoot';
import TileSpecialLayer from './TileSpecialLayer';
import TileSurfaceLayer from './TileSurfaceLayer';
import TileTextLayer from './TileTextLayer';
import { getOrientedTilePanelLayoutForTileSize } from './tilePanelLayout';

export interface TileAssemblyProps {
  tileId: number;
  tile: Tile;
  name?: string;
  hovered?: boolean;
  selected?: boolean;
  ownerColor?: string;
  houses?: number;
  ownershipChange?: OwnershipChangeSignal;
  developmentChange?: DevelopmentChangeSignal;
  goCrossing?: GoCrossingSignal;
  onHover?: (tileId: number | null) => void;
  onSelect?: (tileId: number) => void;
}

export default function TileAssembly({
  tileId,
  tile,
  name = tile.streetName,
  hovered = false,
  selected = false,
  ownerColor,
  houses = 0,
  ownershipChange,
  developmentChange,
  goCrossing,
}: TileAssemblyProps) {
  const layout = getBoardTileLayout(tileId);
  if (!layout) return null;
  const panel = getOrientedTilePanelLayoutForTileSize(layout.size, layout.side);
  return (
    <group
      name={`TileAnchor:${tileId}`}
      position={layout.position}
      rotation={layout.rotation}
      userData={{
        tileId,
        boardTransform: 'canonical',
        layerOrder: TILE_ASSEMBLY_LAYER_ORDER,
        transformContract: TILE_TRANSFORM_CONTRACT,
      }}
    >
      <TileSocketAnchor tileId={tileId} />
      <TileInteractionLayer tileId={tileId} />
      <TilePressRoot tileId={tileId}>
        <TileBodyLayer
          tileId={tileId}
          size={layout.size}
          color={tile.tileType === 'normal'
            ? boardVisualTokens.tileChassis
            : boardVisualTokens.tileChassisSpecial}
          selected={selected}
          hovered={hovered}
        />
        <TileSurfaceLayer
          tile={tile}
          size={layout.size}
        />
        <TileTextLayer tile={tile} name={name} panel={panel} />
        <TileOwnershipLayer
          ownerColor={ownerColor}
          size={layout.size}
          panel={panel}
          selected={selected}
        />
        <TileDevelopmentLayer houses={houses} />
        <TileSpecialLayer
          tile={tile}
          panel={panel}
        />
        <TileFxAnchor
          tileId={tileId}
          panel={panel}
          ownerColor={ownerColor}
          ownershipChange={ownershipChange}
          developmentChange={developmentChange}
          goCrossing={goCrossing}
        />
      </TilePressRoot>
    </group>
  );
}

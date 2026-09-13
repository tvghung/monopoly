import type { Tile } from '@monopoly/shared';
import type {
  DevelopmentChangeSignal,
  GoCrossingSignal,
  OwnershipChangeSignal,
} from '../../../presentation/store/types';
import type { DestinationPreviewRenderModel } from '../boardRenderModel';
import { getBoardTileLayout } from '../boardLayout';
import { TILE_ASSEMBLY_LAYER_ORDER, TILE_TRANSFORM_CONTRACT } from '../architecture/tileAssemblyContracts';
import TileFxAnchor from './TileFxAnchor';
import TileDevelopmentLayer from './TileDevelopmentLayer';
import TileOwnershipLayer from './TileOwnershipLayer';
import TilePressRoot from './TilePressRoot';
import TileSpecialLayer from './TileSpecialLayer';
import TileTextLayer from './TileTextLayer';
import { getOrientedTilePanelLayoutForTileSize } from './tilePanelLayout';

export interface TileAssemblyProps {
  tileId: number;
  tile: Tile;
  name?: string;
  selected?: boolean;
  ownerColor?: string;
  houses?: number;
  ownershipChange?: OwnershipChangeSignal;
  developmentChange?: DevelopmentChangeSignal;
  goCrossing?: GoCrossingSignal;
  destinationPreview?: DestinationPreviewRenderModel;
  reducedMotion?: boolean;
}

export default function TileAssembly({
  tileId,
  tile,
  name = tile.streetName,
  selected = false,
  ownerColor,
  houses = 0,
  ownershipChange,
  developmentChange,
  goCrossing,
  destinationPreview,
  reducedMotion = false,
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
      <TilePressRoot tileId={tileId}>
        <TileTextLayer tile={tile} name={name} panel={panel} />
        <TileOwnershipLayer
          ownerColor={ownerColor}
          size={layout.size}
          panel={panel}
          selected={selected}
          ownershipChange={ownershipChange}
          reducedMotion={reducedMotion}
        />
        <TileDevelopmentLayer
          houses={houses}
          developmentChange={developmentChange}
          ownerColor={ownerColor}
          reducedMotion={reducedMotion}
        />
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
          destinationPreview={destinationPreview}
          reducedMotion={reducedMotion}
        />
      </TilePressRoot>
    </group>
  );
}

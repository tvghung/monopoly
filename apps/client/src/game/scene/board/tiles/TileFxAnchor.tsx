import type {
  DevelopmentChangeSignal,
  GoCrossingSignal,
  OwnershipChangeSignal,
} from '../../../presentation/store/types';
import type { DestinationPreviewRenderModel } from '../boardRenderModel';
import TileActionFeedback from './TileActionFeedback';
import type { TilePanelLayout } from './tilePanelLayout';
import TileDestinationPreview from './TileDestinationPreview';

interface TileFxAnchorProps {
  tileId: number;
  panel: TilePanelLayout;
  ownerColor?: string;
  ownershipChange?: OwnershipChangeSignal;
  developmentChange?: DevelopmentChangeSignal;
  goCrossing?: GoCrossingSignal;
  destinationPreview?: DestinationPreviewRenderModel;
  reducedMotion?: boolean;
}

export default function TileFxAnchor({
  tileId,
  panel,
  ownerColor,
  ownershipChange,
  developmentChange,
  goCrossing,
  destinationPreview,
  reducedMotion = false,
}: TileFxAnchorProps) {
  return (
    <group name={`TileFxAnchor:${tileId}`} userData={{ tileId }}>
      <TileActionFeedback
        panel={panel}
        ownerColor={ownerColor}
        ownershipChange={ownershipChange}
        developmentChange={developmentChange}
        goCrossing={goCrossing}
      />
      {destinationPreview
        ? <TileDestinationPreview panel={panel} signal={destinationPreview} reducedMotion={reducedMotion} />
        : null}
    </group>
  );
}

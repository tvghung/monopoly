import type {
  DevelopmentChangeSignal,
  GoCrossingSignal,
  OwnershipChangeSignal,
} from '../../../presentation/store/types';
import TileActionFeedback from './TileActionFeedback';
import type { TilePanelLayout } from './tilePanelLayout';

interface TileFxAnchorProps {
  tileId: number;
  panel: TilePanelLayout;
  ownerColor?: string;
  ownershipChange?: OwnershipChangeSignal;
  developmentChange?: DevelopmentChangeSignal;
  goCrossing?: GoCrossingSignal;
}

export default function TileFxAnchor({
  tileId,
  panel,
  ownerColor,
  ownershipChange,
  developmentChange,
  goCrossing,
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
    </group>
  );
}

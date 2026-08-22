import { useEffect, useMemo, useState } from 'react';
import { useThree } from '@react-three/fiber';
import { PROPERTY_NAME_Y } from '../architecture/boardArtSpec';
import { boardVisualTokens } from '../boardVisualTokens';
import { getPlayerDisplayColor } from '../../../ui/playerVisualColors';
import type {
  DevelopmentChangeSignal,
  GoCrossingSignal,
  OwnershipChangeSignal,
} from '../../../presentation/store/types';
import SdfSurfaceText from './SdfSurfaceText';
import type { TilePanelLayout } from './tilePanelLayout';

interface TileActionFeedback {
  id: string;
  value: string;
  color: string;
  durationMs: number;
}

export function getTileActionFeedback(
  ownershipChange: OwnershipChangeSignal | undefined,
  developmentChange: DevelopmentChangeSignal | undefined,
  goCrossing: GoCrossingSignal | undefined,
  ownerColor: string | undefined,
): TileActionFeedback | null {
  const candidates: Array<TileActionFeedback & { sequence: number }> = [];
  if (ownershipChange) {
    candidates.push({
      id: ownershipChange.id,
      sequence: ownershipChange.sequence,
      value: ownershipChange.toPlayerId === null
        ? 'Trả chủ'
        : ownershipChange.fromPlayerId === null ? 'Nhận chủ' : 'Đổi chủ',
      color: ownerColor ? getPlayerDisplayColor(ownerColor) : boardVisualTokens.boardAccent,
      durationMs: ownershipChange.durationMs,
    });
  }
  if (developmentChange) {
    candidates.push({
      id: developmentChange.id,
      sequence: developmentChange.sequence,
      value: developmentChange.toHouses === 5 && developmentChange.fromHouses < 5
        ? 'Khách sạn'
        : developmentChange.fromHouses === 5 && developmentChange.toHouses < 5
          ? 'Hạ khách sạn'
          : developmentChange.delta > 0
            ? `+${developmentChange.delta} Nhà`
            : `-${Math.abs(developmentChange.delta)} Nhà`,
      color: developmentChange.toHouses === 5 || developmentChange.fromHouses === 5
        ? boardVisualTokens.hotel
        : boardVisualTokens.house,
      durationMs: developmentChange.durationMs,
    });
  }
  if (goCrossing) {
    candidates.push({
      id: goCrossing.id,
      sequence: goCrossing.sequence,
      value: 'Qua Xuất Phát',
      color: boardVisualTokens.startSignText,
      durationMs: goCrossing.durationMs,
    });
  }
  const latest = candidates.sort((left, right) => right.sequence - left.sequence)[0];
  if (!latest) return null;
  return {
    id: latest.id,
    value: latest.value,
    color: latest.color,
    durationMs: latest.durationMs,
  };
}

interface TileActionFeedbackProps {
  panel: TilePanelLayout;
  ownerColor?: string;
  ownershipChange?: OwnershipChangeSignal;
  developmentChange?: DevelopmentChangeSignal;
  goCrossing?: GoCrossingSignal;
}

export default function TileActionFeedback({
  panel,
  ownerColor,
  ownershipChange,
  developmentChange,
  goCrossing,
}: TileActionFeedbackProps) {
  const invalidate = useThree(state => state.invalidate);
  const feedback = useMemo(
    () => getTileActionFeedback(ownershipChange, developmentChange, goCrossing, ownerColor),
    [developmentChange, goCrossing, ownershipChange, ownerColor],
  );
  const [visibleFeedback, setVisibleFeedback] = useState<TileActionFeedback | null>(null);

  useEffect(() => {
    setVisibleFeedback(feedback);
    if (!feedback) return undefined;
    invalidate();
    const timeout = window.setTimeout(() => {
      setVisibleFeedback(current => current?.id === feedback.id ? null : current);
      invalidate();
    }, Math.max(1, feedback.durationMs));
    return () => window.clearTimeout(timeout);
  }, [feedback, invalidate]);

  if (!visibleFeedback) return null;
  return (
    <SdfSurfaceText
      name="TileActionFeedbackText"
      value={visibleFeedback.value}
      position={[0, PROPERTY_NAME_Y + 0.02, panel.upperCenterLocalZ]}
      fontSize={panel.side === 'CORNER' ? 0.24 : 0.18}
      maxWidth={panel.surfaceSize[0] * 0.9}
      color={visibleFeedback.color}
      lineHeight={1}
      rotationZ={panel.contentRotationY}
    />
  );
}

import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { Group } from 'three';
import { PROPERTY_NAME_Y } from '../architecture/boardArtSpec';
import { boardVisualTokens } from '../boardVisualTokens';
import { getPlayerDisplayColor } from '../../../ui/playerVisualColors';
import { useEffectiveReducedMotion } from '../../../../settings/selectors';
import { presentationTiming } from '../../../presentation/timings';
import type {
  DevelopmentChangeSignal,
  GoCrossingSignal,
  OwnershipChangeSignal,
} from '../../../presentation/store/types';
import SdfSurfaceText from './SdfSurfaceText';
import type { TilePanelLayout } from './tilePanelLayout';
import type { Language } from '../../../../i18n/I18n';
import { translate, useTranslation } from '../../../../i18n/I18n';

interface TileActionFeedback {
  id: string;
  value: string;
  color: string;
  kind: 'OWNERSHIP' | 'DEVELOPMENT' | 'GO';
  pulseDirection: 'UP' | 'DOWN';
  consequenceOrder: number;
}

export const TILE_ACTION_FEEDBACK_DWELL_MS = presentationTiming.feedbackDwell;

export function getTileActionFeedback(
  ownershipChange: OwnershipChangeSignal | undefined,
  developmentChange: DevelopmentChangeSignal | undefined,
  goCrossing: GoCrossingSignal | undefined,
  ownerColor: string | undefined,
  language: Language = 'vi',
): TileActionFeedback | null {
  const t = (key: Parameters<typeof translate>[0], values?: Readonly<Record<string, string | number>>) => translate(key, language, values);
  const candidates: TileActionFeedback[] = [];
  if (ownershipChange) {
    candidates.push({
      id: ownershipChange.id,
      consequenceOrder: ownershipChange.consequenceOrder,
      kind: 'OWNERSHIP',
      pulseDirection: 'UP',
      value: ownershipChange.toPlayerId === null
        ? t('tileFeedback.released')
        : ownershipChange.fromPlayerId === null ? t('tileFeedback.acquired') : t('tileFeedback.transferred'),
      color: ownerColor ? getPlayerDisplayColor(ownerColor) : boardVisualTokens.boardAccent,
    });
  }
  if (developmentChange) {
    candidates.push({
      id: developmentChange.id,
      consequenceOrder: developmentChange.consequenceOrder,
      kind: 'DEVELOPMENT',
      pulseDirection: developmentChange.direction,
      value: developmentChange.toHouses === 5 && developmentChange.fromHouses < 5
        ? t('tileFeedback.hotel')
        : developmentChange.fromHouses === 5 && developmentChange.toHouses < 5
          ? t('tileFeedback.hotelDowngraded')
          : developmentChange.delta > 0
            ? developmentChange.delta === 1
              ? t('tileFeedback.houseBuilt')
              : t('tileFeedback.housesBuilt', { count: developmentChange.delta })
            : Math.abs(developmentChange.delta) === 1
              ? t('tileFeedback.houseSold')
              : t('tileFeedback.housesSold', { count: Math.abs(developmentChange.delta) }),
      color: developmentChange.toHouses === 5 || developmentChange.fromHouses === 5
        ? boardVisualTokens.hotel
        : boardVisualTokens.house,
    });
  }
  if (goCrossing) {
    candidates.push({
      id: goCrossing.id,
      consequenceOrder: goCrossing.consequenceOrder,
      kind: 'GO',
      pulseDirection: 'UP',
      value: t('tileFeedback.passedGo'),
      color: boardVisualTokens.startSignText,
    });
  }
  const latest = candidates.reduce<TileActionFeedback | undefined>(
    (current, candidate) => !current || candidate.consequenceOrder > current.consequenceOrder
      ? candidate
      : current,
    undefined,
  );
  if (!latest) return null;
  return {
    id: latest.id,
    value: latest.value,
    color: latest.color,
    kind: latest.kind,
    pulseDirection: latest.pulseDirection,
    consequenceOrder: latest.consequenceOrder,
  };
}

function TileFeedbackPulse({
  target,
  direction,
}: {
  target: MutableRefObject<Group | null>;
  direction: 'UP' | 'DOWN';
}) {
  const invalidate = useThree(state => state.invalidate);
  const startedAtRef = useRef<number | null>(null);

  useEffect(() => {
    const targetGroup = target.current;
    invalidate();
    return () => {
      targetGroup?.scale.set(1, 1, 1);
    };
  }, [invalidate, target]);

  useFrame(({ clock }) => {
    const targetGroup = target.current;
    if (!targetGroup) return;
    const startedAt = startedAtRef.current ?? clock.elapsedTime * 1000;
    startedAtRef.current = startedAt;
    const progress = Math.min(
      1,
      (clock.elapsedTime * 1000 - startedAt) / presentationTiming.feedbackPulse,
    );
    if (progress >= 1) {
      targetGroup.scale.set(1, 1, 1);
      return;
    }
    const scale = direction === 'DOWN'
      ? 1 - Math.sin(progress * Math.PI) * 0.06
      : 1 + Math.sin(progress * Math.PI) * 0.08;
    targetGroup.scale.set(scale, scale, scale);
    invalidate();
  });

  return null;
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
  const { language } = useTranslation();
  const reducedMotion = useEffectiveReducedMotion();
  const feedbackGroupRef = useRef<Group>(null);
  const feedback = useMemo(
    () => getTileActionFeedback(ownershipChange, developmentChange, goCrossing, ownerColor, language),
    [developmentChange, goCrossing, language, ownershipChange, ownerColor],
  );
  const [visibleFeedback, setVisibleFeedback] = useState<TileActionFeedback | null>(null);
  const [pulseFeedbackId, setPulseFeedbackId] = useState<string | null>(null);

  useEffect(() => {
    setVisibleFeedback(feedback);
    setPulseFeedbackId(
      feedback && !reducedMotion
        ? feedback.id
        : null,
    );
    if (!feedback) return undefined;
    invalidate();
    const timeout = window.setTimeout(() => {
      setVisibleFeedback(current => current?.id === feedback.id ? null : current);
      setPulseFeedbackId(current => current === feedback.id ? null : current);
      invalidate();
    }, TILE_ACTION_FEEDBACK_DWELL_MS);
    const pulseTimeout = window.setTimeout(() => {
      setPulseFeedbackId(current => current === feedback.id ? null : current);
      invalidate();
    }, presentationTiming.feedbackPulse);
    return () => {
      window.clearTimeout(timeout);
      window.clearTimeout(pulseTimeout);
    };
  }, [feedback, invalidate, reducedMotion]);

  if (!visibleFeedback) return null;
  return (
    <group ref={feedbackGroupRef} name="TileActionFeedbackLabel">
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
      {pulseFeedbackId === visibleFeedback.id
        ? <TileFeedbackPulse target={feedbackGroupRef} direction={visibleFeedback.pulseDirection} />
        : null}
    </group>
  );
}

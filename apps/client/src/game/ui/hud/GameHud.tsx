import { memo, useContext, useMemo, type CSSProperties } from 'react';
import type { RoomPlayerMeta } from '@monopoly/shared';
import stateContext from '../../../internal';
import { useEffectiveReducedMotion } from '../../../settings/selectors';
import { usePresentationSelector } from '../../presentation/usePresentationSelector';
import type { PresentationState } from '../../presentation/store/types';
import BottomDock from './BottomDock';
import ActivityTicker from './ActivityTicker';
import CenterStage from './CenterStage';
import DiceResultCallout from './DiceResultCallout';
import PlayerCardList from './PlayerCardList';
import Log from '../../../components/Log';
import { HudDrawerProvider, useHudDrawer } from './hudDrawer';
import { selectPlayerCardViewModels } from './playerCardSelectors';
import StatusPill from './StatusPill';
import TurnBanner from './TurnBanner';
import { useChatBubbles } from './useChatBubbles';
import './hud.css';

const selectCardSlice = (state: PresentationState) => ({
  displayActivePlayerId: state.displayActivePlayerId,
  displayBalances: state.displayBalances,
  displayDevelopmentLevels: state.displayDevelopmentLevels,
});
const sameCardSlice = (
  previous: ReturnType<typeof selectCardSlice>,
  next: ReturnType<typeof selectCardSlice>,
) => previous.displayActivePlayerId === next.displayActivePlayerId
  && previous.displayBalances === next.displayBalances
  && previous.displayDevelopmentLevels === next.displayDevelopmentLevels;
const NO_PLAYERS: readonly RoomPlayerMeta[] = [];
const selectBalanceDeltas = (state: PresentationState) => state.balanceDeltas;
const selectResetEpoch = (state: PresentationState) => state.presentationResetEpoch;
const selectSpeed = (state: PresentationState) => state.animationSpeedMultiplier;

/** The four corner cards, wired to committed state plus the presentation slices they display. */
function PlayerCards() {
  const {
    state, roomPlayers = NO_PLAYERS, playerId, role,
  } = useContext(stateContext);
  const slice = usePresentationSelector(selectCardSlice, sameCardSlice);
  const deltas = usePresentationSelector(selectBalanceDeltas);
  const resetEpoch = usePresentationSelector(selectResetEpoch);
  const speed = usePresentationSelector(selectSpeed);
  const reducedMotion = useEffectiveReducedMotion();
  const drawer = useHudDrawer();
  // Chat is never held back by the presentation queue (plan 03 section 7.1): a message bubbles as soon as the server
  // commits it, so the bubbles read the authoritative feed while the ticker and the log follow the presentation.
  const bubbles = useChatBubbles(state.boardState.activityFeed.events, playerId ?? null, {
    resetEpoch, speed, suppressed: drawer.open,
  });

  const cards = useMemo(
    () => (state.loaded ? selectPlayerCardViewModels(state, slice, roomPlayers, playerId ?? null, role ?? null) : []),
    [playerId, role, roomPlayers, slice, state],
  );

  return (
    <PlayerCardList
      cards={cards}
      deltas={deltas}
      reducedMotion={reducedMotion}
      speed={speed}
      resetEpoch={resetEpoch}
      bubbles={bubbles}
    />
  );
}

/**
 * The layout shell of the game HUD. It sits inside `.game-board__renderer`, over the WebGL scene or the legacy
 * board, and never covers the board center. Each region is a `data-hud-region` container so the overlap checker can
 * measure it. Its children read presentation state through selectors, so the shell itself renders once.
 */
function GameHudShell({ onSelectTile }: { onSelectTile: (tileId: number) => void }) {
  const speed = usePresentationSelector(selectSpeed);
  const style = useMemo(() => ({ '--hud-speed': speed }) as CSSProperties, [speed]);
  return (
    <HudDrawerProvider>
      <div className="game-hud" data-testid="game-hud" style={style}>
        <StatusPill />
        <TurnBanner />
        <PlayerCards />
        <CenterStage />
        <DiceResultCallout />
        <BottomDock onSelectTile={onSelectTile} ticker={<ActivityTicker />} />
        <Log />
      </div>
    </HudDrawerProvider>
  );
}

const GameHud = memo(GameHudShell);
export default GameHud;

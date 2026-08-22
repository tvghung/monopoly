import { useContext, useMemo } from 'react';
import stateContext from '../../../internal';
import { usePresentation } from '../../presentation/PresentationProvider';
import type { BalanceDeltaSignal } from '../../presentation/store/types';
import { formatMoney } from '../formatters';
import PlayerCard from './PlayerCard';
import { selectPlayerHudViewModels } from './playerHudSelectors';
import './PlayerHud.css';

export default function PlayerHud({ activePlayerId }: { activePlayerId: string }) {
  const { state, roomPlayers = [] } = useContext(stateContext);
  const { state: presentationState } = usePresentation();
  const activePlayerName = state.players[activePlayerId]?.name;
  const players = state.loaded ? selectPlayerHudViewModels(state, activePlayerId, roomPlayers) : [];
  const latestBalanceDeltas = useMemo(() => {
    const byPlayer = new Map<string, BalanceDeltaSignal>();
    presentationState.balanceDeltas.forEach(signal => byPlayer.set(signal.playerId, signal));
    return byPlayer;
  }, [presentationState.balanceDeltas]);
  const latestBalanceDelta = presentationState.balanceDeltas.at(-1);
  const latestBalancePlayerName = latestBalanceDelta
    ? state.players[latestBalanceDelta.playerId]?.name ?? 'Người chơi'
    : null;
  const balanceAnnouncement = latestBalanceDelta && latestBalanceDelta.delta !== 0
    ? `${latestBalancePlayerName} ${latestBalanceDelta.delta > 0 ? 'nhận' : 'mất'} ${formatMoney(Math.abs(latestBalanceDelta.delta))}.`
    : '';

  return (
    <section className="player-hud" aria-label="Trạng thái người chơi">
      <p className="sr-only" role="status" aria-live="polite">
        {[balanceAnnouncement, activePlayerName ? 'Đến lượt ' + activePlayerName : '']
          .filter(Boolean)
          .join(' ')}
      </p>
      {state.loaded
        ? (
          <ul className="player-list">
            {players.map(player => (
              <PlayerCard
                key={player.playerId}
                player={player}
                balanceDelta={latestBalanceDeltas.get(player.playerId)}
              />
            ))}
          </ul>
        )
        : 'Đang tải…'}
    </section>
  );
}

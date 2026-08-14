import { useContext } from 'react';
import stateContext from '../../../internal';
import PlayerCard from './PlayerCard';
import { selectPlayerHudViewModels } from './playerHudSelectors';
import './PlayerHud.css';

export default function PlayerHud({ activePlayerId }: { activePlayerId: string }) {
  const { state, roomPlayers = [] } = useContext(stateContext);
  const activePlayerName = state.players[activePlayerId]?.name;
  const players = state.loaded ? selectPlayerHudViewModels(state, activePlayerId, roomPlayers) : [];

  return (
    <section className="center__dashboard__block center__dashboard__block--players player-hud">
      <h3 className="center__dashboard__title">Người chơi</h3>
      <p className="sr-only" role="status" aria-live="polite">
        {activePlayerName ? 'Đến lượt ' + activePlayerName : ''}
      </p>
      {state.loaded
        ? <ul className="player-list" aria-label="Trạng thái người chơi">{players.map(player => <PlayerCard key={player.playerId} player={player} />)}</ul>
        : 'Đang tải…'}
    </section>
  );
}

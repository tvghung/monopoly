import { useContext } from 'react';
import stateContext from '../../../internal';
import { formatMoney } from '../formatters';
import { selectPlayerHudViewModels } from '../hud/playerHudSelectors';

/** Visible stations live in PlayerStationLayer. This DOM surface is accessibility-only. */
export default function PlayerStations({ activePlayerId }: { activePlayerId: string }) {
  const { state, roomPlayers = [] } = useContext(stateContext);
  const players = state.loaded ? selectPlayerHudViewModels(state, activePlayerId, roomPlayers) : [];

  return (
    <section className="player-stations-accessibility sr-only" aria-label="Trạng thái trạm người chơi">
      <ul>
        {players.map(player => {
          const status = player.hasLeft
            ? 'Đã rời ván'
            : player.isBankrupt
              ? 'Phá sản'
              : player.isConnected ? 'Đang kết nối' : 'Mất kết nối';
          return (
            <li
              key={player.playerId}
              data-player-id={player.playerId}
              data-current-turn={player.isCurrentTurn}
            >
              {`${player.name}, ${formatMoney(player.money)}, ${player.propertyCount} tài sản, ${player.houseCount} nhà, ${player.hotelCount} khách sạn, ${status}${player.isCurrentTurn ? ', đang trong lượt' : ''}.`}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

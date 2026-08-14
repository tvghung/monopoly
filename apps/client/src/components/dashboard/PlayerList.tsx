import { useContext } from 'react';
import stateContext from '../../internal';
import { formatMoney } from '../../presentation';

export default function PlayerList({ activePlayerId }: { activePlayerId: string }) {
  const { state } = useContext(stateContext);
  const activePlayerName = state.players[activePlayerId]?.name;

  return (
    <section className="center__dashboard__block center__dashboard__block--players">
      <h3 className="center__dashboard__title">Người chơi</h3>
      <p className="sr-only" role="status" aria-live="polite">
        {activePlayerName ? `Đến lượt ${activePlayerName}` : ''}
      </p>
      {state.loaded
        ? (
          <ul className="player-list">
            {Object.keys(state.players).map((playerId) => {
              const player = state.players[playerId];
              const isCurrent = activePlayerId === playerId;
              return (
                <li
                  key={playerId}
                  className={`player-card${isCurrent ? ' player-card--active' : ''}`}
                  style={{ borderLeftColor: player.color }}
                >
                  <span className="player-card__disc" style={{ backgroundColor: player.color }} aria-hidden="true">
                    <span className="player-card__initial">{player.name.slice(0, 1).toUpperCase()}</span>
                  </span>
                  <div className="player-card__info">
                    <span className="player-card__name">
                      {player.name}
                      {player.isJail ? <span className="player-card__tag" aria-label="Đang ở Nhà Tù">🔒</span> : null}
                      {player.getOutOfJailCardCount > 0
                        ? <span className="player-card__tag" aria-label={`Có ${player.getOutOfJailCardCount} thẻ Thoát Tù`}>🔑</span>
                        : null}
                    </span>
                    <span className="player-card__balance">{formatMoney(player.accountBalance)}</span>
                  </div>
                  {isCurrent
                    ? (
                      <span className="player-card__turn" title="Đang đến lượt" aria-current="true">
                        <span className="player-card__turn-dot" aria-hidden="true" />
                        Đang chơi
                      </span>
                    )
                    : null}
                </li>
              );
            })}
          </ul>
        )
        : 'Đang tải…'}

      {state.loaded && Object.keys(state.boardState.finishedPlayers).length > 0
        ? (
          <>
            <h3 className="center__dashboard__title center__dashboard__title--sub">Đã rời ván</h3>
            <ul className="player-list">
              {Object.entries(state.boardState.finishedPlayers).map(([playerId, player]) => (
                <li key={playerId} className="player-card player-card--out" style={{ borderLeftColor: player.color }}>
                  <span className="player-card__disc" style={{ backgroundColor: player.color }} aria-hidden="true">
                    <span className="player-card__initial">{player.name.slice(0, 1).toUpperCase()}</span>
                  </span>
                  <div className="player-card__info">
                    <span className="player-card__name">{player.name}</span>
                    <span className="player-card__balance">{player.reason === 'LEFT' ? 'Đã rời ván' : 'Phá sản'}</span>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )
        : null}
    </section>
  );
}

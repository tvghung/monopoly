import { useContext } from 'react';
import stateContext from '../../internal';
import { formatMoney } from '../../presentation';

// The "Players" panel: the active roster (with balances, jail/card badges and a
// "Turn" marker) plus a finished-player list once players drop out.
// `activePlayerId` is held by Dashboard so the turn marker only moves once every
// token has finished walking, rather than the instant the server flips turns.
export default function PlayerList({ activePlayerId }: { activePlayerId: string }) {
  const { state } = useContext(stateContext);
  const activePlayerName = state.players[activePlayerId]?.name;

  return (
    <section className="center__dashboard__block center__dashboard__block--players">
      <h3 className="center__dashboard__title">Người chơi</h3>
      <p className="sr-only" role="status" aria-live="polite">
        {activePlayerName ? `Đến lượt ${activePlayerName}` : ''}
      </p>
      <p className="bank-building-inventory">
        {`Ngân hàng: ${state.bankBuildingInventory.housesAvailable} Nhà · ${state.bankBuildingInventory.hotelsAvailable} Khách Sạn`}
      </p>

      {state.loaded
        ? (
          <ul className="player-list">
            {Object.keys(state.players).map((player) => {
              const {
                name, color, accountBalance, isJail, getOutOfJailCardCount,
              } = state.players[player];
              const isCurrent = activePlayerId === player;
              return (
                <li
                  key={player}
                  className={`player-card${isCurrent ? ' player-card--active' : ''}`}
                  style={{ borderLeftColor: color }}
                >
                  <span className="player-card__disc" style={{ backgroundColor: color }} aria-hidden="true">
                    <span className="player-card__initial">{name.slice(0, 1).toUpperCase()}</span>
                  </span>
                  <div className="player-card__info">
                    <span className="player-card__name">
                      {name}
                      {isJail
                        ? <span className="player-card__tag" role="img" aria-label="Đang ở Nhà Tù">🔒</span>
                        : null}
                      {getOutOfJailCardCount > 0
                        ? (
                          <span
                            className="player-card__tag"
                            role="img"
                            aria-label={`Có ${getOutOfJailCardCount} thẻ Thoát Tù Miễn Phí`}
                          >
                            {getOutOfJailCardCount > 1 ? `🔑×${getOutOfJailCardCount}` : '🔑'}
                          </span>
                        )
                        : null}
                    </span>
                    <span className="player-card__balance">{formatMoney(accountBalance)}</span>
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
              {Object.keys(state.boardState.finishedPlayers).map((player) => {
                const { name, color, reason } = state.boardState.finishedPlayers[player];
                return (
                  <li
                    key={player}
                    className="player-card player-card--out"
                    style={{ borderLeftColor: color }}
                  >
                    <span className="player-card__disc" style={{ backgroundColor: color }} aria-hidden="true">
                      <span className="player-card__initial">{name.slice(0, 1).toUpperCase()}</span>
                    </span>
                    <div className="player-card__info">
                      <span className="player-card__name">{name}</span>
                    <span className="player-card__balance">
                      {reason === 'LEFT' ? 'Đã rời ván' : 'Phá sản'}
                    </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )
        : null}
    </section>
  );
}

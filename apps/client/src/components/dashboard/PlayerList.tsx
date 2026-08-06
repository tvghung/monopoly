import { useContext } from 'react';
import stateContext from '../../internal';
import { formatMoney } from './format';

// The "Players" panel: the active roster (with balances, jail/card badges and a
// "Turn" marker) plus a "Bankrupt" list once players start dropping out.
// `activePlayerId` is held by Dashboard so the turn marker only moves once every
// token has finished walking, rather than the instant the server flips turns.
export default function PlayerList({ activePlayerId }: { activePlayerId: string }) {
  const { state } = useContext(stateContext);

  return (
    <section className="center__dashboard__block center__dashboard__block--players">
      <h3 className="center__dashboard__title">Players</h3>

      {state.loaded
        ? (
          <ul className="player-list">
            {Object.keys(state.players).map((player) => {
              const {
                name, color, accountBalance, isJail, getOutOfJailCards,
              } = state.players[player];
              const isCurrent = activePlayerId === player;
              return (
                <li
                  key={player}
                  className={`player-card${isCurrent ? ' player-card--active' : ''}`}
                  style={{ borderLeftColor: color }}
                >
                  <span className="player-card__disc" style={{ backgroundColor: color }}>
                    <span className="player-card__initial">{name.slice(0, 1).toUpperCase()}</span>
                  </span>
                  <div className="player-card__info">
                    <span className="player-card__name">
                      {name}
                      {isJail
                        ? <span className="player-card__tag" title="Currently in jail">🔒</span>
                        : null}
                      {getOutOfJailCards > 0
                        ? (
                          <span
                            className="player-card__tag"
                            title={`Holds ${getOutOfJailCards} Get Out Of Jail Free card${getOutOfJailCards > 1 ? 's' : ''}`}
                          >
                            {getOutOfJailCards > 1 ? `🔑×${getOutOfJailCards}` : '🔑'}
                          </span>
                        )
                        : null}
                    </span>
                    <span className="player-card__balance">{formatMoney(accountBalance)}</span>
                  </div>
                  {isCurrent
                    ? (
                      <span className="player-card__turn" title="Now playing">
                        <span className="player-card__turn-dot" />
                        Turn
                      </span>
                    )
                    : null}
                </li>
              );
            })}
          </ul>
        )
        : 'Loading...'}

      {state.loaded && Object.keys(state.boardState.finishedPlayers).length > 0
        ? (
          <>
            <h3 className="center__dashboard__title center__dashboard__title--sub">Bankrupt</h3>
            <ul className="player-list">
              {Object.keys(state.boardState.finishedPlayers).map((player) => {
                const { name, color } = state.boardState.finishedPlayers[player];
                return (
                  <li
                    key={player}
                    className="player-card player-card--out"
                    style={{ borderLeftColor: color }}
                  >
                    <span className="player-card__disc" style={{ backgroundColor: color }}>
                      <span className="player-card__initial">{name.slice(0, 1).toUpperCase()}</span>
                    </span>
                    <div className="player-card__info">
                      <span className="player-card__name">{name}</span>
                      <span className="player-card__balance">Bankrupt</span>
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

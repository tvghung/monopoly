import './style/Lobby.css';

export interface LobbyPlayerView {
  id: string;
  name: string;
  color: string;
  ready: boolean;
  connected: boolean;
}

interface LobbyProps {
  roomCode: string;
  players: LobbyPlayerView[];
  playerId: string;
  hostPlayerId: string | null;
  minPlayers: number;
  maxPlayers: number;
  busy: boolean;
  error: string | null;
  onSetReady: (ready: boolean) => void;
  onStart: () => void;
  onLeave: () => void;
}

export default function Lobby({
  roomCode,
  players,
  playerId,
  hostPlayerId,
  minPlayers,
  maxPlayers,
  busy,
  error,
  onSetReady,
  onStart,
  onLeave,
}: LobbyProps) {
  const me = players.find(player => player.id === playerId);
  const isHost = hostPlayerId === playerId;
  const canStart = isHost
    && players.length >= minPlayers
    && players.length <= maxPlayers
    && players.every(player => player.ready && player.connected);

  return (
    <section className="lobby" aria-labelledby="lobby-title">
      <article className="lobby__card">
        <header className="lobby__header">
          <div>
            <p className="lobby__eyebrow">Mã phòng</p>
            <h1 id="lobby-title" className="lobby__title">{roomCode}</h1>
          </div>
          <button className="lobby__leave" type="button" disabled={busy} onClick={onLeave}>
            Rời phòng
          </button>
        </header>

        <p className="lobby__hint">
          {`Chủ phòng có thể bắt đầu khi ${minPlayers}–${maxPlayers} người chơi đang kết nối đều sẵn sàng.`}
        </p>

        <ul className="lobby__players">
          {players.map(player => (
            <li className="lobby-player" key={player.id}>
              <span className="lobby-player__disc" style={{ backgroundColor: player.color }} aria-hidden="true" />
              <span className="lobby-player__name">
                {player.name}
                {player.id === playerId ? ' (bạn)' : ''}
              </span>
              {player.id === hostPlayerId ? <span className="lobby-player__host">Chủ phòng</span> : null}
              <span className={player.connected ? 'lobby-player__online' : 'lobby-player__offline'}>
                {player.connected ? 'Trực tuyến' : 'Mất kết nối'}
              </span>
              <span className={player.ready ? 'lobby-player__ready' : 'lobby-player__waiting'}>
                {player.ready ? 'Sẵn sàng' : 'Chưa sẵn sàng'}
              </span>
            </li>
          ))}
        </ul>

        {error ? <p className="lobby__error" role="alert">{error}</p> : null}

        <div className="lobby__actions">
          <button
            className={me?.ready ? 'lobby__button lobby__button--secondary' : 'lobby__button'}
            type="button"
            disabled={busy || !me?.connected}
            onClick={() => onSetReady(!me?.ready)}
          >
            {me?.ready ? 'Hủy sẵn sàng' : 'Sẵn sàng'}
          </button>

          {isHost
            ? (
              <button
                className="lobby__button"
                type="button"
                disabled={busy || !canStart}
                onClick={onStart}
              >
                Bắt đầu ván chơi
              </button>
            )
            : <p className="lobby__waiting-copy">Đang chờ Chủ Phòng bắt đầu…</p>}
        </div>
      </article>
    </section>
  );
}

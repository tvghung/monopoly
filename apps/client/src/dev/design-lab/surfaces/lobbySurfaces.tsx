import Lobby, { type LobbyPlayerView } from '../../../components/Lobby';
import { noop, SurfaceProviders, type SurfaceFixture } from './surfaceKit';

/** The room lobby (plan 04 T04.13). */
const LOBBY_PLAYERS: readonly LobbyPlayerView[] = [
  { id: 'player-a', name: 'An', color: 'red', characterId: 'dog', ready: true, connected: true },
  { id: 'player-b', name: 'Bình', color: 'blue', characterId: 'panda', ready: true, connected: true },
  { id: 'player-c', name: 'Chi', color: 'green', characterId: 'cat', ready: false, connected: true },
];

function lobby(playerId: string, players: readonly LobbyPlayerView[] = LOBBY_PLAYERS) {
  return (
    <SurfaceProviders>
      <Lobby
        roomCode="GAME-1234"
        players={[...players]}
        playerId={playerId}
        hostPlayerId="player-a"
        minPlayers={2}
        maxPlayers={4}
        busy={false}
        error={null}
        onSetReady={noop}
        onSetAppearance={noop}
        onStart={noop}
        onLeave={noop}
        onSettings={noop}
      />
    </SurfaceProviders>
  );
}

export const LOBBY_SURFACES: readonly SurfaceFixture[] = [
  { id: 'lobby-host', label: 'Lobby, host', group: 'Pre-game', render: () => lobby('player-a') },
  { id: 'lobby-guest', label: 'Lobby, guest', group: 'Pre-game', render: () => lobby('player-b') },
  {
    id: 'lobby-alone',
    label: 'Lobby, host alone',
    group: 'Pre-game',
    render: () => lobby('player-a', [{ ...LOBBY_PLAYERS[0], ready: false }]),
  },
];

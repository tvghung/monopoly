import type { ReactNode } from 'react';
import BootstrapErrorScreen from '../../../app/screens/BootstrapErrorScreen';
import LoadingScreen from '../../../app/screens/LoadingScreen';
import BuyPrompt from '../../../components/dashboard/BuyPrompt';
import DevelopmentPrompt from '../../../components/dashboard/DevelopmentPrompt';
import JailPanel from '../../../components/dashboard/JailPanel';
import WinnerBanner from '../../../components/dashboard/WinnerBanner';
import ConnectionOverlay from '../../../components/ConnectionOverlay';
import JoinForm from '../../../components/JoinForm';
import Lobby, { type LobbyPlayerView } from '../../../components/Lobby';
import SpectatorBanner from '../../../components/SpectatorBanner';
import SettingsPanel from '../../../settings/SettingsPanel';
import SurfaceProviders, { makeSurfaceState, type SurfaceStateOptions } from './SurfaceProviders';

/**
 * The real components of plan 04, each with the state it needs, selectable with `&surface=<id>` (plan 04 §9).
 * Keep an entry per surface that plan 04 restyles: the G4 captures and the before / after comparisons read this list.
 */
export interface SurfaceFixture {
  id: string;
  label: string;
  group: 'Pre-game' | 'Decisions' | 'Inspection' | 'Victory' | 'Settings' | 'Screens';
  render: () => ReactNode;
}

const noop = () => undefined;

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

/** A game-state surface: the component inside the providers of the fixture room. */
function withState(options: SurfaceStateOptions, children: ReactNode): ReactNode {
  return <SurfaceProviders value={makeSurfaceState(options)}>{children}</SurfaceProviders>;
}

const OWNED_PAIR = {
  1: { id: 'player-a', color: 'red' as const, houses: 1 },
  3: { id: 'player-a', color: 'red' as const, houses: 0 },
};

export const SURFACES: readonly SurfaceFixture[] = [
  {
    id: 'landing',
    label: 'Landing',
    group: 'Pre-game',
    render: () => (
      <SurfaceProviders>
        <JoinForm onJoin={noop} busy={false} connected error={null} />
      </SurfaceProviders>
    ),
  },
  {
    id: 'landing-prefilled',
    label: 'Landing, room code from a link, connecting',
    group: 'Pre-game',
    render: () => (
      <SurfaceProviders>
        <JoinForm onJoin={noop} busy={false} connected={false} error="Không thể vào phòng. Hãy thử lại." initialRoomCode="GAME-1234" />
      </SurfaceProviders>
    ),
  },
  { id: 'lobby-host', label: 'Lobby, host', group: 'Pre-game', render: () => lobby('player-a') },
  { id: 'lobby-guest', label: 'Lobby, guest', group: 'Pre-game', render: () => lobby('player-b') },
  {
    id: 'lobby-alone',
    label: 'Lobby, host alone',
    group: 'Pre-game',
    render: () => lobby('player-a', [{ ...LOBBY_PLAYERS[0], ready: false }]),
  },
  {
    id: 'settings',
    label: 'Settings',
    group: 'Settings',
    render: () => (
      <SurfaceProviders>
        <SettingsPanel open onClose={noop} />
      </SurfaceProviders>
    ),
  },
  {
    id: 'loading',
    label: 'Loading screen',
    group: 'Screens',
    render: () => <LoadingScreen stage="loading-assets" />,
  },
  {
    id: 'bootstrap-error',
    label: 'Bootstrap error',
    group: 'Screens',
    render: () => <BootstrapErrorScreen onRetry={noop} />,
  },
  { id: 'connection', label: 'Connection lost overlay', group: 'Screens', render: () => <ConnectionOverlay /> },
  { id: 'spectator', label: 'Spectator banner', group: 'Screens', render: () => <SpectatorBanner /> },
  {
    id: 'buy',
    label: 'Buy prompt',
    group: 'Decisions',
    render: () => withState({
      mutate: room => {
        room.gameState.turnInfo.pendingLandingDecision = {
          kind: 'PURCHASE', operationId: 'purchase-1', playerId: 'player-a', tileID: 6, price: 100,
        };
      },
    }, <BuyPrompt tokenArrived />),
  },
  {
    id: 'buy-short',
    label: 'Buy prompt, not enough cash',
    group: 'Decisions',
    render: () => withState({
      mutate: room => {
        room.gameState.players['player-a'].accountBalance = 80;
        room.gameState.turnInfo.pendingLandingDecision = {
          kind: 'PURCHASE', operationId: 'purchase-1', playerId: 'player-a', tileID: 6, price: 100,
        };
      },
    }, <BuyPrompt tokenArrived />),
  },
  {
    id: 'development-houses',
    label: 'Development, houses',
    group: 'Decisions',
    render: () => withState({
      mutate: room => {
        room.gameState.boardState.ownedProps = { ...OWNED_PAIR };
        room.gameState.turnInfo.pendingLandingDecision = {
          kind: 'DEVELOP_HOUSES', operationId: 'develop-1', playerId: 'player-a', tileID: 1, unitCost: 50, maxQuantity: 3,
        };
      },
    }, <DevelopmentPrompt tokenArrived />),
  },
  {
    id: 'development-hotel',
    label: 'Development, hotel',
    group: 'Decisions',
    render: () => withState({
      mutate: room => {
        room.gameState.boardState.ownedProps = { 1: { id: 'player-a', color: 'red', houses: 4 }, 3: { id: 'player-a', color: 'red', houses: 4 } };
        room.gameState.turnInfo.pendingLandingDecision = {
          kind: 'UPGRADE_HOTEL', operationId: 'develop-2', playerId: 'player-a', tileID: 1, unitCost: 50, maxQuantity: 1,
        };
      },
    }, <DevelopmentPrompt tokenArrived />),
  },
  {
    id: 'jail',
    label: 'Jail panel',
    group: 'Decisions',
    render: () => withState({
      mutate: room => {
        room.gameState.players['player-a'].isJail = true;
        room.gameState.players['player-a'].getOutOfJailCardCount = 1;
        room.gameState.players['player-a'].jailOpponentRoundsElapsed = 1;
      },
    }, <div style={{ width: 'min(28rem, 92vw)', margin: '2rem auto' }}><JailPanel /></div>),
  },
  {
    id: 'winner-host',
    label: 'Victory, host',
    group: 'Victory',
    render: () => withState({
      canPlayAgain: true,
      mutate: room => {
        room.status = 'FINISHED';
        room.gameState.boardState.ownedProps = { ...OWNED_PAIR, 5: { id: 'player-a', color: 'red', houses: 5 } };
        room.gameState.boardState.finishedPlayers = {
          'player-b': { name: 'Bình', color: 'blue', characterId: 'panda', reason: 'BANKRUPT', accountBalance: 0 },
        };
        delete room.gameState.players['player-b'];
        room.gameState.boardState.winner = {
          playerId: 'player-a', name: 'An', color: 'red', characterId: 'dog', accountBalance: 3200,
        };
      },
    }, <WinnerBanner />),
  },
  {
    id: 'winner-guest',
    label: 'Victory, guest',
    group: 'Victory',
    render: () => withState({
      playerId: 'player-b',
      mutate: room => {
        room.status = 'FINISHED';
        room.gameState.boardState.ownedProps = { ...OWNED_PAIR };
        room.gameState.boardState.winner = {
          playerId: 'player-a', name: 'An', color: 'red', characterId: 'dog', accountBalance: 3200,
        };
      },
    }, <WinnerBanner />),
  },
];

export function findSurface(id: string | null): SurfaceFixture | undefined {
  return id === null ? undefined : SURFACES.find(surface => surface.id === id);
}

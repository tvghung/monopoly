import { useEffect, useState, type ReactNode } from 'react';
import type { PublicTeam, SeatSwapRequest } from '@monopoly/shared';
import Lobby, { type LobbyPlayerView } from '../../../components/Lobby';
import type { HostRuntimeStatus, OwnTheBlockDesktopBridge } from '../../../runtime/types';
import { noop, SurfaceProviders, type SurfaceFixture } from './surfaceKit';

/** The room lobby (plan 04 T04.13). */
const LOBBY_PLAYERS: readonly LobbyPlayerView[] = [
  { id: 'player-a', name: 'An', color: 'red', characterId: 'dog', teamId: 'TEAM_1', teamSlot: 0, ready: true, connected: true },
  { id: 'player-b', name: 'Bình', color: 'blue', characterId: 'panda', teamId: 'TEAM_2', teamSlot: 0, ready: true, connected: true },
  { id: 'player-c', name: 'Chi', color: 'green', characterId: 'cat', teamId: 'TEAM_1', teamSlot: 1, ready: false, connected: true },
];

/** All four seats: a ready host, a ready guest, one still choosing and one whose connection dropped. */
const FULL_PLAYERS: readonly LobbyPlayerView[] = [
  ...LOBBY_PLAYERS,
  { id: 'player-d', name: 'Dũng', color: 'yellow', characterId: 'duck', teamId: 'TEAM_2', teamSlot: 1, ready: true, connected: false },
];

/** 2v2: An and Chi are "Rồng" (red), Bình and Dũng are "Phượng" (blue); everybody wears the team colour. */
const TEAM_PLAYERS: readonly LobbyPlayerView[] = [
  { id: 'player-a', name: 'An', color: 'red', characterId: 'dog', teamId: 'TEAM_1', teamSlot: 0, ready: true, connected: true },
  { id: 'player-b', name: 'Bình', color: 'blue', characterId: 'panda', teamId: 'TEAM_2', teamSlot: 0, ready: true, connected: true },
  { id: 'player-c', name: 'Chi', color: 'red', characterId: 'cat', teamId: 'TEAM_1', teamSlot: 1, ready: false, connected: true },
  { id: 'player-d', name: 'Dũng', color: 'blue', characterId: 'duck', teamId: 'TEAM_2', teamSlot: 1, ready: true, connected: true },
];

const LAB_TEAMS: readonly PublicTeam[] = [
  { teamId: 'TEAM_1', name: 'Rồng', color: 'red', memberPlayerIds: ['player-a', 'player-c'] },
  { teamId: 'TEAM_2', name: 'Phượng', color: 'blue', memberPlayerIds: ['player-b', 'player-d'] },
];

/** The 2v2 lobby with every team and seat command wired to a no-op, so the kick keys, the swap buttons and the dialogs are live. */
function teamLobby(
  playerId: string,
  players: readonly LobbyPlayerView[] = TEAM_PLAYERS,
  seatSwapRequests: readonly SeatSwapRequest[] = [],
) {
  return lobby(playerId, players, {
    gameMode: 'TEAM_2V2',
    teams: [...LAB_TEAMS],
    seatSwapRequests,
    onSetGameMode: noop,
    onSetTeamName: noop,
    onSetTeamColor: noop,
    onMoveToSeat: noop,
    onRequestSeatSwap: noop,
    onCancelSeatSwap: noop,
    onRespondSeatSwap: noop,
  });
}

/** An and Chi share "Rồng"; Bình sits alone in the second seat of "Phượng", so the first cell of that team is the empty one. */
const SECOND_SEAT_PLAYERS: readonly LobbyPlayerView[] = [
  TEAM_PLAYERS[0],
  { ...TEAM_PLAYERS[1], teamSlot: 1 },
  TEAM_PLAYERS[2],
];

/**
 * The kick confirmation opens from a press on a seat's X, so a surface that shows it presses that key once the lobby has
 * rendered (the Lab has no pointer): the question, its copy and its focus are the production ones.
 */
function PressOnMount({ label, children }: { label: string; children: ReactNode }) {
  useEffect(() => {
    document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)?.click();
  }, [label]);
  return children;
}

function lobby(
  playerId: string,
  players: readonly LobbyPlayerView[] = LOBBY_PLAYERS,
  props: Partial<Parameters<typeof Lobby>[0]> = {},
) {
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
        onKickPlayer={noop}
        {...props}
      />
    </SurfaceProviders>
  );
}

const LAB_LAN_STATUS: HostRuntimeStatus = {
  state: 'HOSTING',
  platform: 'win32',
  appVersion: '3.0.0',
  gamePort: 53120,
  localEndpoint: 'http://127.0.0.1:53120',
  lanAvailable: true,
  interfaces: [
    {
      name: 'Wi-Fi', displayName: 'Wi-Fi', address: '192.168.1.15', netmask: '255.255.255.0', preference: 'preferred', rank: 0,
    },
    {
      name: 'Ethernet', displayName: 'Ethernet', address: '10.0.0.8', netmask: '255.255.255.0', preference: 'fallback', rank: 1,
    },
  ],
  advertisedEndpoints: ['http://192.168.1.15:53120', 'http://10.0.0.8:53120'],
  selectedLanUrl: 'http://192.168.1.15:53120',
};

/** The Electron bridge as the LAN card and the settings provider see it: a fixed hosting status and nothing else. */
function makeLanBridge(status: HostRuntimeStatus): OwnTheBlockDesktopBridge {
  const result = { ok: true as const, status };
  return {
    getRuntimeConfig: () => Promise.reject(new Error('Not available in the Design Lab.')),
    window: {
      getState: () => Promise.resolve({ fullscreen: false, maximized: false, resizable: true }),
      setFullscreen: () => Promise.resolve(),
      toggleFullscreen: () => Promise.resolve(),
      onFullscreenChanged: () => noop,
    },
    quit: { onQuitRequested: () => noop, respond: noop },
    openExternal: () => Promise.resolve(),
    host: {
      getStatus: () => Promise.resolve(status),
      start: () => Promise.resolve(result),
      stop: () => Promise.resolve(result),
      refreshNetwork: () => Promise.resolve(status),
      onStatusChanged: () => noop,
    },
  };
}

/**
 * The LAN card and the settings provider read `window.ownTheBlockDesktop` while they render, so the stub is installed before
 * the first render of the children and removed when the surface unmounts; the effect puts it back for a StrictMode remount.
 */
function DesktopBridgeStub({ status, children }: { status: HostRuntimeStatus; children: ReactNode }) {
  const [bridge] = useState(() => {
    const created = makeLanBridge(status);
    window.ownTheBlockDesktop = created;
    return created;
  });
  useEffect(() => {
    window.ownTheBlockDesktop = bridge;
    return () => {
      if (window.ownTheBlockDesktop === bridge) delete window.ownTheBlockDesktop;
    };
  }, [bridge]);
  return children;
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
  {
    id: 'lobby-full',
    label: 'Lobby, four seats (ready, waiting, offline)',
    group: 'Pre-game',
    render: () => lobby('player-a', FULL_PLAYERS),
  },
  {
    id: 'lobby-start-blocked',
    label: 'Lobby, start blocked by a duplicate appearance',
    group: 'Pre-game',
    render: () => lobby('player-a', [
      LOBBY_PLAYERS[0],
      { ...LOBBY_PLAYERS[1], color: 'red', characterId: 'dog' },
    ]),
  },
  {
    id: 'lobby-2v2-host',
    label: 'Lobby, 2v2 host (teams, mode, kick, swap)',
    group: 'Pre-game',
    render: () => teamLobby('player-a'),
  },
  {
    id: 'lobby-2v2-guest',
    label: 'Lobby, 2v2 guest (own team colour, locked teammate mascot)',
    group: 'Pre-game',
    render: () => teamLobby('player-c'),
  },
  {
    id: 'lobby-2v2-incomplete',
    label: 'Lobby, 2v2 with three players (empty seat to move into, start blocked)',
    group: 'Pre-game',
    render: () => teamLobby('player-a', TEAM_PLAYERS.slice(0, 3)),
  },
  {
    id: 'lobby-2v2-second-seat',
    label: 'Lobby, 2v2 with a lone player in the second seat (empty seat in its own cell)',
    group: 'Pre-game',
    render: () => teamLobby('player-c', SECOND_SEAT_PLAYERS),
  },
  {
    id: 'lobby-2v2-swap-pending',
    label: 'Lobby, 2v2 swap asked and waiting for the answer',
    group: 'Pre-game',
    render: () => teamLobby('player-a', TEAM_PLAYERS, [{ requesterPlayerId: 'player-a', targetPlayerId: 'player-b' }]),
  },
  {
    id: 'lobby-2v2-swap-request',
    label: 'Lobby, 2v2 swap request asked of the viewer (dialog)',
    group: 'Pre-game',
    render: () => teamLobby('player-b', TEAM_PLAYERS, [{ requesterPlayerId: 'player-a', targetPlayerId: 'player-b' }]),
  },
  {
    id: 'lobby-kick-confirm',
    label: 'Lobby, 2v2 host asked to confirm removing a player (dialog)',
    group: 'Pre-game',
    render: () => (
      <PressOnMount label="Mời Bình ra khỏi phòng">
        {teamLobby('player-a')}
      </PressOnMount>
    ),
  },
  {
    id: 'lobby-lan',
    label: 'Lobby, host with the LAN invitation',
    group: 'Pre-game',
    render: () => (
      <DesktopBridgeStub status={LAB_LAN_STATUS}>
        {lobby('player-a', LOBBY_PLAYERS, { showLanSharing: true })}
      </DesktopBridgeStub>
    ),
  },
];

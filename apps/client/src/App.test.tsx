import {
  act, cleanup, fireEvent, render, screen,
} from '@testing-library/react';
import { StrictMode } from 'react';
import type { PublicRoomState } from '@monopoly/shared';
import { SOCKET_PROTOCOL_VERSION } from '@monopoly/shared';
import {
  afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest';

type SocketHandler = (...args: unknown[]) => void;

const socketHarness = vi.hoisted(() => {
  const handlers = new Map<string, Set<SocketHandler>>();
  const emissions: Array<{ event: string; args: unknown[] }> = [];

  const socket = {
    id: 'transport-only-id',
    connected: false,
    auth: {},
    on(event: string, handler: SocketHandler) {
      const eventHandlers = handlers.get(event) ?? new Set<SocketHandler>();
      eventHandlers.add(handler);
      handlers.set(event, eventHandlers);
      return socket;
    },
    off(event: string, handler: SocketHandler) {
      handlers.get(event)?.delete(handler);
      return socket;
    },
    emit(event: string, ...args: unknown[]) {
      emissions.push({ event, args });
      return socket;
    },
    connect() {
      socket.connected = true;
      handlers.get('connect')?.forEach(handler => handler());
      return socket;
    },
    disconnect() {
      socket.connected = false;
      handlers.get('disconnect')?.forEach(handler => handler('io client disconnect'));
      return socket;
    },
  };

  return {
    socket,
    emissions,
    trigger(event: string, ...args: unknown[]) {
      handlers.get(event)?.forEach(handler => handler(...args));
    },
    listenerCount(event: string) {
      return handlers.get(event)?.size ?? 0;
    },
    reset() {
      handlers.clear();
      emissions.length = 0;
      socket.connected = false;
    },
  };
});

vi.mock('socket.io-client', () => ({ io: () => socketHarness.socket }));

import App from './App';
import { ToastProvider } from './components/Toast';
import { PLAYER_SESSION_STORAGE_KEY } from './playerSessionStorage';

const RECONNECT_TOKEN = 'A'.repeat(43);
const FORFEIT_TOKEN = 'B'.repeat(43);

const room: PublicRoomState = {
  protocolVersion: SOCKET_PROTOCOL_VERSION,
  version: 1,
  roomId: 'room-uuid',
  roomCode: 'ROOM-42',
  status: 'LOBBY',
  hostPlayerId: 'stable-player-id',
  minPlayers: 2,
  maxPlayers: 7,
  players: [{
    playerId: 'stable-player-id',
    name: 'Ada',
    color: 'red',
    joinOrder: 1,
    membershipStatus: 'ACTIVE',
    ready: false,
    connected: true,
  }],
  gameState: {
    boardState: {
      gameStarted: false,
      players: ['stable-player-id'],
      finishedPlayers: {},
      currentPlayer: { id: '', hasMoved: false },
      turnNumber: 0,
      turnRecovery: null,
      logs: [],
      diceValue: { dice1: 0, dice2: 0 },
      ownedProps: {},
      openMarket: {},
      winner: null,
      auction: null,
    },
    players: {},
    turnInfo: {},
    loaded: true,
  },
};

function lastEmission(event: string) {
  for (let index = socketHarness.emissions.length - 1; index >= 0; index -= 1) {
    const emission = socketHarness.emissions[index];
    if (emission.event === event) return emission;
  }
  return undefined;
}

function isAckCallback(value: unknown): value is (response: unknown) => void {
  return typeof value === 'function';
}

describe('App session admission', () => {
  beforeEach(() => {
    socketHarness.reset();
    window.localStorage.clear();
  });

  afterEach(cleanup);

  it('persists a pending token before resuming with a stable player identity', () => {
    render(
      <StrictMode>
        <ToastProvider>
          <App />
        </ToastProvider>
      </StrictMode>,
    );

    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Ada' } });
    fireEvent.change(screen.getByLabelText('Room code'), { target: { value: 'room-42' } });
    fireEvent.click(screen.getByRole('button', { name: 'Join game' }));

    const join = lastEmission('join room');
    expect(join?.args[0]).toEqual({ name: 'Ada', roomCode: 'ROOM-42' });
    const joinAck = join?.args[1];
    expect(typeof joinAck).toBe('function');

    act(() => {
      if (isAckCallback(joinAck)) {
        joinAck({
          ok: true,
          protocolVersion: SOCKET_PROTOCOL_VERSION,
          data: {
            kind: 'PENDING',
            role: 'PLAYER',
            token: RECONNECT_TOKEN,
            expiresAt: new Date(Date.now() + 300_000).toISOString(),
          },
        });
      }
    });

    expect(window.localStorage.getItem(PLAYER_SESSION_STORAGE_KEY)).toContain(RECONNECT_TOKEN);
    const resume = lastEmission('resume session');
    expect(resume?.args[0]).toEqual({ token: RECONNECT_TOKEN });
    const resumeAck = resume?.args[1];

    act(() => {
      if (isAckCallback(resumeAck)) {
        resumeAck({
          ok: true,
          protocolVersion: SOCKET_PROTOCOL_VERSION,
          revision: room.version,
          data: {
            role: 'PLAYER',
            playerId: 'stable-player-id',
            room,
            pendingOffers: [],
          },
        });
      }
    });

    expect(screen.getByRole('heading', { name: 'ROOM-42' })).toBeTruthy();
    expect(screen.getByText('Ada (you)')).toBeTruthy();
    expect(screen.queryByText('transport-only-id')).toBeNull();

    act(() => { socketHarness.socket.disconnect(); });
    expect(screen.getByText(/Connection lost/)).toBeTruthy();

    act(() => { socketHarness.socket.connect(); });
    const reconnectAck = lastEmission('resume session')?.args[1];
    act(() => {
      if (isAckCallback(reconnectAck)) {
        reconnectAck({
          ok: true,
          protocolVersion: SOCKET_PROTOCOL_VERSION,
          revision: 2,
          data: {
            role: 'PLAYER',
            playerId: 'stable-player-id',
            room: { ...room, version: 2 },
            pendingOffers: [],
          },
        });
      }
    });

    expect(screen.queryByText(/Connection lost/)).toBeNull();
    expect(screen.getByText('Ada (you)')).toBeTruthy();
  });

  it('abandons an unactivatable admission when browser storage is unavailable', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => { throw new Error('storage blocked'); });

    render(
      <ToastProvider>
        <App />
      </ToastProvider>,
    );
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Ada' } });
    fireEvent.change(screen.getByLabelText('Room code'), { target: { value: 'room-42' } });
    fireEvent.click(screen.getByRole('button', { name: 'Join game' }));

    const joinAck = lastEmission('join room')?.args[1];
    act(() => {
      if (isAckCallback(joinAck)) {
        joinAck({
          ok: true,
          protocolVersion: SOCKET_PROTOCOL_VERSION,
          data: {
            kind: 'PENDING',
            role: 'PLAYER',
            token: RECONNECT_TOKEN,
            expiresAt: new Date(Date.now() + 300_000).toISOString(),
          },
        });
      }
    });

    expect(screen.getByRole('heading', { name: 'Unable to restore game' })).toBeTruthy();
    expect(socketHarness.socket.connected).toBe(false);
    setItem.mockRestore();

    fireEvent.click(screen.getByRole('button', { name: 'Return to join' }));
    expect(socketHarness.socket.connected).toBe(true);
    expect(screen.getByRole('button', { name: 'Join game' })).toBeTruthy();
  });

  it('requires confirmation before an active player forfeits the game', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const gameRoom: PublicRoomState = {
      ...room,
      status: 'IN_PROGRESS',
      version: 3,
      gameState: {
        ...room.gameState,
        boardState: {
          ...room.gameState.boardState,
          gameStarted: true,
          players: ['stable-player-id'],
          currentPlayer: { id: 'stable-player-id', hasMoved: false },
        },
        players: {
          'stable-player-id': {
            name: 'Ada',
            currentTile: 0,
            color: 'red',
            accountBalance: 1500,
            isJail: false,
            jailRounds: 0,
            getOutOfJailCards: 0,
          },
        },
      },
    };

    render(
      <ToastProvider>
        <App />
      </ToastProvider>,
    );
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Ada' } });
    fireEvent.change(screen.getByLabelText('Room code'), { target: { value: 'room-42' } });
    fireEvent.click(screen.getByRole('button', { name: 'Join game' }));

    const joinAck = lastEmission('join room')?.args[1];
    act(() => {
      if (isAckCallback(joinAck)) {
        joinAck({
          ok: true,
          protocolVersion: SOCKET_PROTOCOL_VERSION,
          data: {
            kind: 'PENDING',
            role: 'PLAYER',
            token: FORFEIT_TOKEN,
            expiresAt: new Date(Date.now() + 300_000).toISOString(),
          },
        });
      }
    });
    const resumeAck = lastEmission('resume session')?.args[1];
    act(() => {
      if (isAckCallback(resumeAck)) {
        resumeAck({
          ok: true,
          protocolVersion: SOCKET_PROTOCOL_VERSION,
          revision: gameRoom.version,
          data: {
            role: 'PLAYER',
            playerId: 'stable-player-id',
            room: gameRoom,
            pendingOffers: [],
          },
        });
      }
    });

    fireEvent.click(screen.getByRole('button', { name: 'Forfeit game' }));
    expect(confirm).toHaveBeenCalledOnce();
    expect(lastEmission('leave room')).toBeUndefined();

    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: 'Forfeit game' }));
    expect(lastEmission('leave room')).toBeDefined();
    confirm.mockRestore();
  });

  it('keeps spectator admission read-only and lets the spectator leave', () => {
    const spectatorRoom: PublicRoomState = {
      ...room,
      status: 'IN_PROGRESS',
      hostPlayerId: 'another-player',
      gameState: {
        ...room.gameState,
        boardState: {
          ...room.gameState.boardState,
          gameStarted: true,
        },
      },
    };
    render(
      <ToastProvider>
        <App />
      </ToastProvider>,
    );
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Viewer' } });
    fireEvent.change(screen.getByLabelText('Room code'), { target: { value: 'room-42' } });
    fireEvent.click(screen.getByRole('button', { name: 'Join game' }));

    const joinAck = lastEmission('join room')?.args[1];
    act(() => {
      if (isAckCallback(joinAck)) {
        joinAck({
          ok: true,
          protocolVersion: SOCKET_PROTOCOL_VERSION,
          revision: spectatorRoom.version,
          data: {
            kind: 'SPECTATOR',
            role: 'SPECTATOR',
            playerId: null,
            room: spectatorRoom,
          },
        });
      }
    });

    expect(screen.getByText(/Spectator mode/)).toBeTruthy();
    expect(window.localStorage.getItem(PLAYER_SESSION_STORAGE_KEY)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Leave room' }));
    const leaveAck = lastEmission('leave room')?.args[0];
    act(() => {
      if (isAckCallback(leaveAck)) {
        leaveAck({
          ok: true,
          protocolVersion: SOCKET_PROTOCOL_VERSION,
          data: { roomDeleted: false },
        });
      }
    });
    expect(screen.getByRole('button', { name: 'Join game' })).toBeTruthy();
  });

  it('enters a terminal replaced state and removes socket listeners on unmount', () => {
    const view = render(
      <ToastProvider>
        <App />
      </ToastProvider>,
    );
    expect(socketHarness.listenerCount('update')).toBe(1);

    act(() => {
      socketHarness.trigger('session replaced', {
        code: 'SESSION_REPLACED',
        message: 'This session moved to a newer connection.',
      });
    });
    expect(screen.getByRole('heading', { name: 'Session opened elsewhere' })).toBeTruthy();
    expect(socketHarness.socket.connected).toBe(false);

    view.unmount();
    expect(socketHarness.listenerCount('update')).toBe(0);
    expect(socketHarness.listenerCount('offer cancelled')).toBe(0);
  });
});

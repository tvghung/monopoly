import {
  act, cleanup, fireEvent, render, screen,
} from '@testing-library/react';
import { StrictMode } from 'react';
import type { PrivateOffer, PublicRoomState } from '@monopoly/shared';
import { SOCKET_PROTOCOL_VERSION } from '@monopoly/shared';
import {
  afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest';

type SocketHandler = (...args: unknown[]) => void;

const socketHarness = vi.hoisted(() => {
  const handlers = new Map<string, Set<SocketHandler>>();
  const emissions: Array<{ event: string; args: unknown[] }> = [];
  let connectCount = 0;

  const socket = {
    id: 'transport-only-id',
    connected: false,
    auth: {},
    io: { reconnection: vi.fn() },
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
      connectCount += 1;
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
    get connectCount() { return connectCount; },
    trigger(event: string, ...args: unknown[]) {
      handlers.get(event)?.forEach(handler => handler(...args));
    },
    listenerCount(event: string) {
      return handlers.get(event)?.size ?? 0;
    },
    reset() {
      handlers.clear();
      emissions.length = 0;
      connectCount = 0;
      socket.connected = false;
      socket.io.reconnection.mockReset();
    },
  };
});

vi.mock('socket.io-client', () => ({ io: () => socketHarness.socket }));

import App from './App';
import { ToastProvider } from './components/Toast';
import { PLAYER_SESSION_STORAGE_KEY } from './playerSessionStorage';
import type { OwnTheBlockDesktopBridge } from './runtime/types';

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
  maxPlayers: 4,
  players: [{
    playerId: 'stable-player-id',
    name: 'Ada',
    color: 'red',
    characterId: null,
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
      turnNumber: 0,
      currentPlayer: { id: '', hasMoved: false },
      turnRecovery: null,
    logs: [],
    diceValue: { dice1: 0, dice2: 0 },
    rollSequence: 0,
    gameplayEvents: { sequence: 0, events: [] },
    activityFeed: { sequence: 0, events: [] },
    ownedProps: {},
      winner: null,
    },
    players: {},
    turnInfo: {},
    deckCounts: { chance: 16, chest: 16 },
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

  afterEach(() => {
    cleanup();
    delete window.ownTheBlockDesktop;
    Reflect.deleteProperty(document, 'visibilityState');
    window.history.replaceState({}, '', '/');
  });

  it('prefills a valid invitation room without submitting it automatically', () => {
    window.history.replaceState({}, '', '/?room=otb-abc234');

    render(
      <ToastProvider>
        <App />
      </ToastProvider>,
    );

    expect(screen.getByLabelText<HTMLInputElement>('Mã phòng').value).toBe('OTB-ABC234');
    expect(lastEmission('join room')).toBeUndefined();
  });

  it('reconnects after foreground and network resume without emitting a leave command', () => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
    render(
      <ToastProvider>
        <App />
      </ToastProvider>,
    );
    expect(socketHarness.connectCount).toBe(1);

    act(() => { socketHarness.socket.disconnect(); });
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(socketHarness.connectCount).toBe(2);

    act(() => { socketHarness.socket.disconnect(); });
    act(() => { window.dispatchEvent(new Event('online')); });
    expect(socketHarness.connectCount).toBe(3);
    expect(lastEmission('leave room')).toBeUndefined();
  });

  it('persists a pending token before resuming with a stable player identity', () => {
    render(
      <StrictMode>
        <ToastProvider>
          <App />
        </ToastProvider>
      </StrictMode>,
    );

    fireEvent.change(screen.getByLabelText('Tên của bạn'), { target: { value: 'Ada' } });
    fireEvent.change(screen.getByLabelText('Mã phòng'), { target: { value: 'room-42' } });
    fireEvent.click(screen.getByRole('button', { name: 'Vào phòng' }));

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

    expect(JSON.parse(window.localStorage.getItem(PLAYER_SESSION_STORAGE_KEY) ?? '{}')).toMatchObject({
      version: 3,
      sessions: {
        'http://localhost:3000': { token: RECONNECT_TOKEN, roomCode: 'ROOM-42' },
      },
    });
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
            privatePlayerState: {
              playerId: 'stable-player-id',
              heldJailFreeCardIds: [],
              gameplayEvents: { sequence: 0, events: [] },
            },
            pendingOffers: [],
          },
        });
      }
    });

    expect(screen.getByRole('heading', { name: 'ROOM-42' })).toBeTruthy();
    expect(screen.getByText('Ada (bạn)')).toBeTruthy();
    expect(screen.queryByText('transport-only-id')).toBeNull();

    act(() => { socketHarness.socket.disconnect(); });
    expect(screen.getByText(/Đã mất kết nối/)).toBeTruthy();

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
            privatePlayerState: {
              playerId: 'stable-player-id',
              heldJailFreeCardIds: [],
              gameplayEvents: { sequence: 0, events: [] },
            },
            pendingOffers: [],
          },
        });
      }
    });

    expect(screen.queryByText(/Đã mất kết nối/)).toBeNull();
    expect(screen.getByText('Ada (bạn)')).toBeTruthy();
  });

  it('prefers a matching desktop session token over the initial join request', () => {
    const socketUrl = 'http://192.168.1.15:8080';
    const runtimeConfig = {
      target: 'desktop' as const,
      socketUrl,
      platform: 'win32' as const,
      appVersion: '3.0.0',
    };
    window.localStorage.setItem(PLAYER_SESSION_STORAGE_KEY, JSON.stringify({
      version: 3,
      sessions: {
        [socketUrl]: { token: RECONNECT_TOKEN, roomCode: 'LAN-42' },
      },
    }));
    window.localStorage.setItem('monopoly.player-session.v2', JSON.stringify({
      version: 2,
      sessions: { [socketUrl]: RECONNECT_TOKEN },
    }));

    render(
      <ToastProvider>
        <App
          runtimeConfig={runtimeConfig}
          launch={{
            runtimeConfig,
            initialJoin: { name: 'Ada', roomCode: 'LAN-42' },
            targetRoomCode: 'LAN-42',
            hosting: false,
          }}
        />
      </ToastProvider>,
    );

    const resume = lastEmission('resume session');
    expect(resume?.args[0]).toEqual({ token: RECONNECT_TOKEN });
    expect(lastEmission('join room')).toBeUndefined();

    const resumeAck = resume?.args[1];
    act(() => {
      if (isAckCallback(resumeAck)) {
        resumeAck({
          ok: true,
          protocolVersion: SOCKET_PROTOCOL_VERSION,
          revision: 1,
          data: {
            role: 'PLAYER',
            playerId: 'stable-player-id',
            room: { ...room, roomCode: 'LAN-42' },
            privatePlayerState: {
              playerId: 'stable-player-id',
              heldJailFreeCardIds: [],
              gameplayEvents: { sequence: 0, events: [] },
            },
            pendingOffers: [],
          },
        });
      }
    });

    expect(screen.getByText('Ada (bạn)')).toBeTruthy();
  });

  it('joins the selected room when the stored session belongs to another room', () => {
    const socketUrl = 'http://192.168.1.15:8080';
    const runtimeConfig = {
      target: 'desktop' as const,
      socketUrl,
      platform: 'win32' as const,
      appVersion: '3.0.0',
    };
    window.localStorage.setItem(PLAYER_SESSION_STORAGE_KEY, JSON.stringify({
      version: 3,
      sessions: {
        [socketUrl]: { token: RECONNECT_TOKEN, roomCode: 'LAN-OLD' },
      },
    }));

    render(
      <ToastProvider>
        <App
          runtimeConfig={runtimeConfig}
          launch={{
            runtimeConfig,
            initialJoin: { name: 'Ada', roomCode: 'LAN-NEW' },
            targetRoomCode: 'LAN-NEW',
            hosting: false,
          }}
        />
      </ToastProvider>,
    );

    expect(lastEmission('resume session')).toBeUndefined();
    expect(lastEmission('join room')?.args[0]).toEqual({ name: 'Ada', roomCode: 'LAN-NEW' });
  });

  it('clears a terminal desktop session and returns to the launcher without fallback join', () => {
    const socketUrl = 'http://192.168.1.15:8080';
    const runtimeConfig = {
      target: 'desktop' as const,
      socketUrl,
      platform: 'win32' as const,
      appVersion: '3.0.0',
    };
    const onExitToLauncher = vi.fn();
    window.ownTheBlockDesktop = {
      quit: {
        onQuitRequested: () => () => undefined,
        respond: vi.fn(),
      },
    } as unknown as OwnTheBlockDesktopBridge;
    window.localStorage.setItem(PLAYER_SESSION_STORAGE_KEY, JSON.stringify({
      version: 3,
      sessions: {
        [socketUrl]: { token: RECONNECT_TOKEN, roomCode: 'LAN-42' },
      },
    }));

    render(
      <ToastProvider>
        <App
          runtimeConfig={runtimeConfig}
          launch={{
            runtimeConfig,
            initialJoin: { name: 'Ada', roomCode: 'LAN-42' },
            targetRoomCode: 'LAN-42',
            hosting: false,
          }}
          onExitToLauncher={onExitToLauncher}
        />
      </ToastProvider>,
    );

    const resumeAck = lastEmission('resume session')?.args[1];
    act(() => {
      if (isAckCallback(resumeAck)) {
        resumeAck({
          ok: false,
          protocolVersion: SOCKET_PROTOCOL_VERSION,
          error: {
            code: 'SESSION_INVALID',
            message: 'session invalid',
            retryable: false,
          },
        });
      }
    });

    expect(window.localStorage.getItem(PLAYER_SESSION_STORAGE_KEY)).toBeNull();
    expect(lastEmission('join room')).toBeUndefined();
    fireEvent.click(screen.getByRole('button', { name: 'Quay về trình khởi động LAN' }));
    expect(onExitToLauncher).toHaveBeenCalledOnce();
  });

  it.each([
    ['timeout', 'Kết nối đã hết thời gian chờ'],
    ['websocket error', 'Không thể tới Host'],
  ])('surfaces a desktop %s failure and abandons the stale socket', (message, expected) => {
    const runtimeConfig = {
      target: 'desktop' as const,
      socketUrl: 'http://192.168.1.15:8080',
      platform: 'win32' as const,
      appVersion: '3.0.0',
    };
    const onExitToLauncher = vi.fn();
    window.ownTheBlockDesktop = {
      quit: {
        onQuitRequested: () => () => undefined,
        respond: vi.fn(),
      },
    } as unknown as OwnTheBlockDesktopBridge;

    render(
      <ToastProvider>
        <App
          runtimeConfig={runtimeConfig}
          launch={{
            runtimeConfig,
            initialJoin: { name: 'Ada', roomCode: 'LAN-42' },
            targetRoomCode: 'LAN-42',
            hosting: false,
          }}
          onExitToLauncher={onExitToLauncher}
        />
      </ToastProvider>,
    );

    act(() => socketHarness.trigger('connect_error', new Error(message)));

    expect(screen.getByText(new RegExp(expected, 'u'))).toBeTruthy();
    expect(socketHarness.socket.io.reconnection).toHaveBeenCalledWith(false);
    expect(socketHarness.socket.connected).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Quay về trình khởi động LAN' }));
    expect(onExitToLauncher).toHaveBeenCalledOnce();
  });

  it('clears private offers and presentation history when a finished room replays', () => {
    const finishedRoom: PublicRoomState = {
      ...room,
      version: 2,
      status: 'FINISHED',
      players: [{ ...room.players[0], ready: true }],
      gameState: {
        ...room.gameState,
        boardState: {
          ...room.gameState.boardState,
          gameStarted: true,
          players: ['stable-player-id'],
          winner: {
            playerId: 'stable-player-id',
            name: 'Ada',
            color: 'red',
            characterId: null,
          },
        },
        players: {
          'stable-player-id': {
            name: 'Ada',
            currentTile: 7,
            color: 'red',
            characterId: null,
            accountBalance: 900,
            isJail: false,
            jailOpponentRoundsElapsed: 0,
            getOutOfJailCardCount: 1,
          },
        },
      },
    };
    const replayRoom: PublicRoomState = {
      ...room,
      version: 3,
      gameState: {
        ...room.gameState,
        boardState: {
          ...room.gameState.boardState,
          players: ['stable-player-id'],
        },
      },
    };
    const pendingOffer: PrivateOffer = {
      offerId: '00000000-0000-4000-8000-000000000021',
      roomId: room.roomId,
      proposerPlayerId: 'other-player',
      recipientPlayerId: 'stable-player-id',
      proposerName: 'Bình',
      recipientName: 'Ada',
      offered: { cash: 100, propertyIds: [], jailFreeCardIds: [] },
      requested: { cash: 0, propertyIds: [], jailFreeCardIds: [] },
      status: 'PENDING',
      createdAt: '2026-08-25T12:00:00.000Z',
      expiresAt: '2026-08-25T13:00:00.000Z',
      resolvedAt: null,
    };

    render(
      <ToastProvider>
        <App />
      </ToastProvider>,
    );
    fireEvent.change(screen.getByLabelText('Tên của bạn'), { target: { value: 'Ada' } });
    fireEvent.change(screen.getByLabelText('Mã phòng'), { target: { value: 'room-42' } });
    fireEvent.click(screen.getByRole('button', { name: 'Vào phòng' }));

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
    const resumeAck = lastEmission('resume session')?.args[1];
    act(() => {
      if (isAckCallback(resumeAck)) {
        resumeAck({
          ok: true,
          protocolVersion: SOCKET_PROTOCOL_VERSION,
          revision: finishedRoom.version,
          data: {
            role: 'PLAYER',
            playerId: 'stable-player-id',
            room: finishedRoom,
            privatePlayerState: {
              playerId: 'stable-player-id',
              heldJailFreeCardIds: ['chance-jail-free'],
              gameplayEvents: { sequence: 0, events: [] },
            },
            pendingOffers: [pendingOffer],
          },
        });
      }
    });

    expect(screen.getByText('Đề nghị từ Bình')).toBeTruthy();
    act(() => socketHarness.trigger('update', replayRoom));
    expect(screen.queryByText('Đề nghị từ Bình')).toBeNull();
  });

  it('abandons an unactivatable admission when browser storage is unavailable', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => { throw new Error('storage blocked'); });

    render(
      <ToastProvider>
        <App />
      </ToastProvider>,
    );
    fireEvent.change(screen.getByLabelText('Tên của bạn'), { target: { value: 'Ada' } });
    fireEvent.change(screen.getByLabelText('Mã phòng'), { target: { value: 'room-42' } });
    fireEvent.click(screen.getByRole('button', { name: 'Vào phòng' }));

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

    expect(screen.getByRole('heading', { name: 'Không thể khôi phục ván chơi' })).toBeTruthy();
    expect(socketHarness.socket.connected).toBe(false);
    setItem.mockRestore();

    fireEvent.click(screen.getByRole('button', { name: 'Quay về màn hình vào phòng' }));
    expect(socketHarness.socket.connected).toBe(true);
    expect(screen.getByRole('button', { name: 'Vào phòng' })).toBeTruthy();
  });

  it('requires confirmation before an active player forfeits the game', () => {
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
        },
        players: {
          'stable-player-id': {
            name: 'Ada',
            currentTile: 0,
            color: 'red',
            characterId: 'dog',
            accountBalance: 1500,
            isJail: false,
            jailOpponentRoundsElapsed: 0,
            getOutOfJailCardCount: 0,
          },
        },
      },
    };

    render(
      <ToastProvider>
        <App />
      </ToastProvider>,
    );
    fireEvent.change(screen.getByLabelText('Tên của bạn'), { target: { value: 'Ada' } });
    fireEvent.change(screen.getByLabelText('Mã phòng'), { target: { value: 'room-42' } });
    fireEvent.click(screen.getByRole('button', { name: 'Vào phòng' }));

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
            privatePlayerState: {
              playerId: 'stable-player-id',
              heldJailFreeCardIds: [],
              gameplayEvents: { sequence: 0, events: [] },
            },
            pendingOffers: [],
          },
        });
      }
    });

    expect(screen.getByText(/^FPS (?:--|\d+)$/)).toBeTruthy();
    const settingsButton = screen.getByRole('button', { name: 'Cài đặt' });
    const surrenderButton = screen.getByRole('button', { name: 'Bỏ cuộc' });
    expect(settingsButton.textContent).toBe('');
    expect(surrenderButton.textContent).toBe('');
    expect(settingsButton.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(settingsButton);
    expect(settingsButton.className).toContain('room-settings-button--open');
    expect(settingsButton.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Đóng' }));
    expect(settingsButton.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: 'Bỏ cuộc' }));
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    expect(lastEmission('leave room')).toBeUndefined();

    const confirmationButtons = screen.getAllByRole('button', { name: 'Bỏ cuộc' });
    fireEvent.click(confirmationButtons[confirmationButtons.length - 1]);
    expect(lastEmission('leave room')).toBeDefined();
  });

  it('disconnects the renderer without stopping the independent desktop host', async () => {
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
        },
        players: {
          'stable-player-id': {
            name: 'Ada',
            currentTile: 0,
            color: 'red',
            characterId: 'dog',
            accountBalance: 1500,
            isJail: false,
            jailOpponentRoundsElapsed: 0,
            getOutOfJailCardCount: 0,
          },
        },
      },
    };
    const socketUrl = 'http://192.168.1.15:8080';
    const runtimeConfig = {
      target: 'desktop' as const,
      socketUrl,
      platform: 'win32' as const,
      appVersion: '3.0.0',
    };
    const stopHost = vi.fn(() => Promise.resolve());
    const onExitToLauncher = vi.fn();
    window.ownTheBlockDesktop = {
      quit: {
        onQuitRequested: () => () => undefined,
        respond: vi.fn(),
      },
      host: { stop: stopHost },
    } as unknown as OwnTheBlockDesktopBridge;
    window.localStorage.setItem(PLAYER_SESSION_STORAGE_KEY, JSON.stringify({
      version: 3,
      sessions: {
        [socketUrl]: { token: FORFEIT_TOKEN, roomCode: 'ROOM-42' },
      },
    }));

    render(
      <ToastProvider>
        <App
          runtimeConfig={runtimeConfig}
          launch={{ runtimeConfig, targetRoomCode: 'ROOM-42', hosting: true }}
          onExitToLauncher={onExitToLauncher}
        />
      </ToastProvider>,
    );
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
            privatePlayerState: {
              playerId: 'stable-player-id',
              heldJailFreeCardIds: [],
              gameplayEvents: { sequence: 0, events: [] },
            },
            pendingOffers: [],
          },
        });
      }
    });

    fireEvent.click(screen.getByRole('button', { name: 'Bỏ cuộc' }));
    const confirmationButtons = screen.getAllByRole('button', { name: 'Bỏ cuộc' });
    fireEvent.click(confirmationButtons[confirmationButtons.length - 1]);
    const leaveAck = lastEmission('leave room')?.args[0];
    await act(async () => {
      if (isAckCallback(leaveAck)) {
        leaveAck({
          ok: true,
          protocolVersion: SOCKET_PROTOCOL_VERSION,
          data: { roomDeleted: false },
        });
        await Promise.resolve();
      }
    });

    expect(stopHost).not.toHaveBeenCalled();
    expect(socketHarness.socket.connected).toBe(false);
    expect(window.localStorage.getItem(PLAYER_SESSION_STORAGE_KEY)).toBeNull();
    expect(onExitToLauncher).toHaveBeenCalledOnce();
  });

  it('returns a desktop spectator to the launcher after leaving', async () => {
    const spectatorRoom: PublicRoomState = {
      ...room,
      roomCode: 'LAN-SPECTATOR',
      status: 'IN_PROGRESS',
      hostPlayerId: 'another-player',
      gameState: {
        ...room.gameState,
        boardState: { ...room.gameState.boardState, gameStarted: true },
      },
    };
    const runtimeConfig = {
      target: 'desktop' as const,
      socketUrl: 'http://192.168.1.15:8080',
      platform: 'win32' as const,
      appVersion: '3.0.0',
    };
    const onExitToLauncher = vi.fn();
    window.ownTheBlockDesktop = {
      quit: {
        onQuitRequested: () => () => undefined,
        respond: vi.fn(),
      },
    } as unknown as OwnTheBlockDesktopBridge;

    render(
      <ToastProvider>
        <App
          runtimeConfig={runtimeConfig}
          launch={{
            runtimeConfig,
            initialJoin: { name: 'Viewer', roomCode: spectatorRoom.roomCode },
            targetRoomCode: spectatorRoom.roomCode,
            hosting: false,
          }}
          onExitToLauncher={onExitToLauncher}
        />
      </ToastProvider>,
    );
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

    fireEvent.click(screen.getByRole('button', { name: 'Rời phòng' }));
    const leaveAck = lastEmission('leave room')?.args[0];
    await act(async () => {
      if (isAckCallback(leaveAck)) {
        leaveAck({
          ok: true,
          protocolVersion: SOCKET_PROTOCOL_VERSION,
          data: { roomDeleted: false },
        });
        await Promise.resolve();
      }
    });

    expect(socketHarness.socket.connected).toBe(false);
    expect(onExitToLauncher).toHaveBeenCalledOnce();
  });

  it('confirms active desktop close without emitting leave room', () => {
    let quitListener: ((requestId: string) => void) | undefined;
    const respond = vi.fn();
    const bridge: OwnTheBlockDesktopBridge = {
      getRuntimeConfig: () => Promise.resolve({
        ok: true,
        config: {
          target: 'desktop',
          socketUrl: 'http://127.0.0.1:8080',
          platform: 'win32',
          appVersion: '1.0.0',
        },
      }),
      window: {
        getState: () => Promise.resolve({ fullscreen: false, maximized: false, resizable: true }),
        setFullscreen: () => Promise.resolve(),
        toggleFullscreen: () => Promise.resolve(),
        onFullscreenChanged: () => () => {},
      },
      quit: {
        onQuitRequested: listener => {
          quitListener = listener;
          return () => { quitListener = undefined; };
        },
        respond,
      },
      openExternal: () => Promise.resolve(),
    };
    window.ownTheBlockDesktop = bridge;
    const gameRoom: PublicRoomState = {
      ...room,
      status: 'IN_PROGRESS',
      version: 4,
      gameState: {
        ...room.gameState,
        boardState: { ...room.gameState.boardState, gameStarted: true },
      },
    };
    window.localStorage.setItem('monopoly.player-session.v1', JSON.stringify({
      version: 1,
      token: RECONNECT_TOKEN,
    }));

    render(
      <ToastProvider>
        <App />
      </ToastProvider>,
    );
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
            privatePlayerState: {
              playerId: 'stable-player-id',
              heldJailFreeCardIds: [],
              gameplayEvents: { sequence: 0, events: [] },
            },
            pendingOffers: [],
          },
        });
      }
    });

    act(() => quitListener?.('desktop-quit-1'));
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    expect(lastEmission('leave room')).toBeUndefined();
    fireEvent.click(screen.getByRole('button', { name: 'Đóng cửa sổ' }));

    expect(respond).toHaveBeenCalledWith('desktop-quit-1', true);
    expect(lastEmission('leave room')).toBeUndefined();
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
    fireEvent.change(screen.getByLabelText('Tên của bạn'), { target: { value: 'Viewer' } });
    fireEvent.change(screen.getByLabelText('Mã phòng'), { target: { value: 'room-42' } });
    fireEvent.click(screen.getByRole('button', { name: 'Vào phòng' }));

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

    expect(screen.getByText(/Chế độ Khán Giả/)).toBeTruthy();
    expect(window.localStorage.getItem(PLAYER_SESSION_STORAGE_KEY)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Rời phòng' }));
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
    expect(screen.getByRole('button', { name: 'Vào phòng' })).toBeTruthy();
  });

  it('enters a terminal replaced state and removes socket listeners on unmount', () => {
    const view = render(
      <ToastProvider>
        <App />
      </ToastProvider>,
    );
    expect(socketHarness.listenerCount('update')).toBe(1);
    expect(socketHarness.listenerCount('private player state')).toBe(1);

    act(() => {
      socketHarness.trigger('session replaced', {
        code: 'SESSION_REPLACED',
        message: 'This session moved to a newer connection.',
      });
    });
    expect(screen.getByRole('heading', { name: 'Phiên chơi đã được mở ở nơi khác' })).toBeTruthy();
    expect(socketHarness.socket.connected).toBe(false);

    view.unmount();
    expect(socketHarness.listenerCount('update')).toBe(0);
    expect(socketHarness.listenerCount('private player state')).toBe(0);
    expect(socketHarness.listenerCount('offer cancelled')).toBe(0);
  });

  it('hydrates held card ids from resume ACK and refreshes them from the private event', () => {
    const gameRoom: PublicRoomState = {
      ...room,
      status: 'IN_PROGRESS',
      version: 5,
      players: [
        ...room.players,
        {
          playerId: 'other-player-id',
          name: 'Bình',
          color: 'blue',
          characterId: 'panda',
          joinOrder: 2,
          membershipStatus: 'ACTIVE',
          ready: true,
          connected: true,
        },
      ],
      gameState: {
        ...room.gameState,
        boardState: {
          ...room.gameState.boardState,
          gameStarted: true,
          players: ['stable-player-id', 'other-player-id'],
          ownedProps: {
            1: { id: 'other-player-id', color: 'blue', houses: 0 },
          },
        },
        players: {
          'stable-player-id': {
            name: 'Ada',
            currentTile: 0,
            color: 'red',
            characterId: 'dog',
            accountBalance: 1500,
            isJail: false,
            jailOpponentRoundsElapsed: 0,
            getOutOfJailCardCount: 1,
          },
          'other-player-id': {
            name: 'Bình',
            currentTile: 4,
            color: 'blue',
            characterId: 'panda',
            accountBalance: 1200,
            isJail: false,
            jailOpponentRoundsElapsed: 0,
            getOutOfJailCardCount: 0,
          },
        },
      },
    };
    window.localStorage.setItem('monopoly.player-session.v1', JSON.stringify({
      version: 1,
      token: RECONNECT_TOKEN,
    }));

    render(
      <ToastProvider>
        <App />
      </ToastProvider>,
    );
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
            privatePlayerState: {
              playerId: 'stable-player-id',
              heldJailFreeCardIds: ['chance-jail-free'],
              gameplayEvents: { sequence: 0, events: [] },
            },
            pendingOffers: [],
          },
        });
      }
    });

    fireEvent.click(screen.getByRole('button', { name: /Ô 1: Cà Mau/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Đề nghị mua' }));
    expect(screen.getByLabelText(/Thẻ Thoát Tù Miễn Phí \(Cơ Hội\)/)).toBeTruthy();

    act(() => {
      socketHarness.trigger('private player state', {
        playerId: 'other-player-id',
        heldJailFreeCardIds: ['chest-jail-free'],
        gameplayEvents: { sequence: 0, events: [] },
      });
    });
    expect(screen.getByLabelText(/Thẻ Thoát Tù Miễn Phí \(Cơ Hội\)/)).toBeTruthy();
    expect(screen.queryByLabelText(/Thẻ Thoát Tù Miễn Phí \(Khí Vận\)/)).toBeNull();

    act(() => {
      socketHarness.trigger('private player state', {
        playerId: 'stable-player-id',
        heldJailFreeCardIds: ['chest-jail-free'],
        gameplayEvents: { sequence: 0, events: [] },
      });
    });
    expect(screen.getByLabelText(/Thẻ Thoát Tù Miễn Phí \(Khí Vận\)/)).toBeTruthy();
    expect(screen.queryByLabelText(/Thẻ Thoát Tù Miễn Phí \(Cơ Hội\)/)).toBeNull();
  });
});

import {
  act, cleanup, fireEvent, render, screen, waitFor, within,
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
    connected: false, kind: 'HUMAN' as const,
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

import App, { RECONNECT_STALL_MS } from './App';
import { ToastProvider } from './components/Toast';
import { HowToPlayProvider } from './howToPlay/HowToPlayProvider';
import { PLAYER_SESSION_STORAGE_KEY } from './playerSessionStorage';
import type { OwnTheBlockDesktopBridge } from './runtime/types';
import { soloTeamBoardFields } from './game/presentation/testFixtures';

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
    teamId: 'TEAM_1',
    teamSlot: 0,
    playerId: 'stable-player-id',
    name: 'Ada',
    color: 'red',
    characterId: null,
    joinOrder: 1,
    membershipStatus: 'ACTIVE',
    ready: false,
    connected: true, kind: 'HUMAN' as const,
  }],
  gameState: {
    boardState: {
      ...soloTeamBoardFields(),
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
    // While the saved session is being resumed, the shared loading screen says so inside the app shell's own main.
    expect(screen.getByText('Đang khôi phục ván chơi…').closest('section.app-screen--loading')).not.toBeNull();

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
    expect(screen.queryByText('Đang khôi phục ván chơi…')).toBeNull();
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
            initialJoin: { name: 'Ada', roomCode: 'LAN-NEW', hostCapability: 'a'.repeat(64) },
            targetRoomCode: 'LAN-NEW',
            hosting: true,
          }}
        />
      </ToastProvider>,
    );

    expect(lastEmission('resume session')).toBeUndefined();
    expect(lastEmission('join room')?.args[0]).toEqual({ name: 'Ada', roomCode: 'LAN-NEW',
      hostCapability: 'a'.repeat(64) });
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
    fireEvent.click(screen.getByRole('button', { name: 'Về trang chủ' }));
    expect(onExitToLauncher).toHaveBeenCalledOnce();
  });

  it.each([
    ['timeout', 'Không vào được phòng. Hãy kiểm tra Wi-Fi rồi thử lại.'],
    ['websocket error', 'Không vào được phòng. Hãy kiểm tra Wi-Fi rồi thử lại.'],
  ])('surfaces a desktop %s failure in plain words and abandons the stale socket', (message, expected) => {
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

    expect(screen.getByText(expected)).toBeTruthy();
    // The owner's rule: players do not read technical text.
    expect(screen.queryByText(/tường lửa|VPN|mạng khách|Host|địa chỉ/iu)).toBeNull();
    expect(socketHarness.socket.io.reconnection).toHaveBeenCalledWith(false);
    expect(socketHarness.socket.connected).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Về trang chủ' }));
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
            teamId: 'TEAM_1',
            playerId: 'stable-player-id',
            name: 'Ada',
            color: 'red',
            characterId: null,
          },
        },
        players: {
          'stable-player-id': {
            teamId: 'TEAM_1',
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
            teamId: 'TEAM_1',
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
            teamId: 'TEAM_1',
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

    // Giving up does not throw the player out: the same socket asks to watch, and the player picks what happens next.
    expect(window.localStorage.getItem(PLAYER_SESSION_STORAGE_KEY)).toBeNull();
    expect(lastEmission('join room')?.args[0]).toEqual({ name: 'Ada', roomCode: gameRoom.roomCode });
    const watchAck = lastEmission('join room')?.args[1];
    act(() => {
      if (isAckCallback(watchAck)) {
        watchAck({
          ok: true,
          protocolVersion: SOCKET_PROTOCOL_VERSION,
          revision: gameRoom.version + 1,
          data: {
            kind: 'SPECTATOR',
            role: 'SPECTATOR',
            playerId: null,
            room: { ...gameRoom, version: gameRoom.version + 1 },
          },
        });
      }
    });
    const choice = screen.getByRole('alertdialog', { name: 'Bạn đã bỏ cuộc' });
    expect(within(choice).getByRole('button', { name: 'Xem tiếp' })).toBeTruthy();
    expect(screen.getByRole('complementary', { name: 'Khán giả' })).toBeTruthy();
    expect(socketHarness.socket.connected).toBe(true);
    expect(onExitToLauncher).not.toHaveBeenCalled();

    // "Rời phòng" leaves for good: back to the launcher while the independent desktop host keeps running.
    fireEvent.click(within(choice).getByRole('button', { name: 'Rời phòng' }));
    const spectatorLeaveAck = lastEmission('leave room')?.args[0];
    await act(async () => {
      if (isAckCallback(spectatorLeaveAck)) {
        spectatorLeaveAck({
          ok: true,
          protocolVersion: SOCKET_PROTOCOL_VERSION,
          data: { roomDeleted: false },
        });
        await Promise.resolve();
      }
    });

    expect(stopHost).not.toHaveBeenCalled();
    expect(socketHarness.socket.connected).toBe(false);
    expect(onExitToLauncher).toHaveBeenCalledOnce();
  });

  /** A player in a running game on the web who confirms "Bỏ cuộc"; returns once the server accepted the leave. */
  async function forfeitWebPlayer() {
    const gameRoom: PublicRoomState = {
      ...room,
      status: 'IN_PROGRESS',
      version: 3,
      gameState: {
        ...room.gameState,
        boardState: { ...room.gameState.boardState, gameStarted: true, players: ['stable-player-id'] },
        players: {
          'stable-player-id': {
            teamId: 'TEAM_1',
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
    window.localStorage.setItem(PLAYER_SESSION_STORAGE_KEY, JSON.stringify({
      version: 3,
      sessions: { [window.location.origin]: { token: FORFEIT_TOKEN, roomCode: 'ROOM-42' } },
    }));
    render(<ToastProvider><App /></ToastProvider>);
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
        leaveAck({ ok: true, protocolVersion: SOCKET_PROTOCOL_VERSION, data: { roomDeleted: false } });
        await Promise.resolve();
      }
    });
    return gameRoom;
  }

  it('lets a player who gave up keep watching with "Xem tiếp"', async () => {
    const gameRoom = await forfeitWebPlayer();
    const watchAck = lastEmission('join room')?.args[1];
    act(() => {
      if (isAckCallback(watchAck)) {
        watchAck({
          ok: true,
          protocolVersion: SOCKET_PROTOCOL_VERSION,
          revision: gameRoom.version + 1,
          data: {
            kind: 'SPECTATOR',
            role: 'SPECTATOR',
            playerId: null,
            room: { ...gameRoom, version: gameRoom.version + 1 },
          },
        });
      }
    });

    fireEvent.click(within(screen.getByRole('alertdialog', { name: 'Bạn đã bỏ cuộc' })).getByRole('button', { name: 'Xem tiếp' }));

    expect(screen.queryByRole('alertdialog', { name: 'Bạn đã bỏ cuộc' })).toBeNull();
    expect(screen.getByRole('complementary', { name: 'Khán giả' })).toBeTruthy();
    expect(socketHarness.socket.connected).toBe(true);
  });

  it('leaves for good when the room can no longer be watched after giving up', async () => {
    await forfeitWebPlayer();
    const watchAck = lastEmission('join room')?.args[1];
    act(() => {
      if (isAckCallback(watchAck)) {
        watchAck({
          ok: false,
          protocolVersion: SOCKET_PROTOCOL_VERSION,
          error: { code: 'ROOM_GONE', message: 'The room no longer exists.', retryable: false },
        });
      }
    });

    expect(screen.queryByRole('alertdialog', { name: 'Bạn đã bỏ cuộc' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Vào phòng' })).toBeTruthy();
    expect(screen.getByText('Bạn đã bỏ cuộc và rời phòng.')).toBeTruthy();
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

    // A spectator can leave from the banner as well as from the toolbar; both run the same leave flow.
    fireEvent.click(within(screen.getByRole('complementary', { name: 'Khán giả' })).getByRole('button', { name: 'Rời phòng' }));
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
    // The banner and the toolbar both offer "Rời phòng"; this test leaves through the toolbar.
    expect(screen.getAllByRole('button', { name: 'Rời phòng' })).toHaveLength(2);
    fireEvent.click(document.querySelector<HTMLButtonElement>('.room-toolbar .room-exit-button') as HTMLButtonElement);
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
          teamId: 'TEAM_2',
          teamSlot: 0,
          playerId: 'other-player-id',
          name: 'Bình',
          color: 'blue',
          characterId: 'panda',
          joinOrder: 2,
          membershipStatus: 'ACTIVE',
          ready: true,
          connected: true, kind: 'HUMAN' as const,
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
            teamId: 'TEAM_1',
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
            teamId: 'TEAM_2',
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

describe('App way back to the start screen (desktop)', () => {
  const socketUrl = 'http://192.168.1.15:8080';
  const runtimeConfig = {
    target: 'desktop' as const,
    socketUrl,
    platform: 'win32' as const,
    appVersion: '3.0.0',
  };
  const launch = {
    runtimeConfig,
    initialJoin: { name: 'Ada', roomCode: 'LAN-42' },
    targetRoomCode: 'LAN-42',
    hosting: false,
  };
  const HOME = 'Về trang chủ';
  const BACK = 'Quay lại';

  beforeEach(() => {
    socketHarness.reset();
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    delete window.ownTheBlockDesktop;
    window.history.replaceState({}, '', '/');
  });

  function installBridge() {
    window.ownTheBlockDesktop = {
      quit: { onQuitRequested: () => () => undefined, respond: vi.fn() },
    } as unknown as OwnTheBlockDesktopBridge;
  }

  /** `null` renders the app with no way back to a start screen. */
  function renderDesktop(onExitToLauncher: (() => void) | null = vi.fn()) {
    installBridge();
    render(
      <ToastProvider>
        <App runtimeConfig={runtimeConfig} launch={launch} onExitToLauncher={onExitToLauncher ?? undefined} />
      </ToastProvider>,
    );
    return onExitToLauncher;
  }

  function answerJoin(response: unknown) {
    const ack = lastEmission('join room')?.args[1];
    act(() => { if (isAckCallback(ack)) ack(response); });
  }

  const roomNotFound = {
    ok: false,
    protocolVersion: SOCKET_PROTOCOL_VERSION,
    error: { code: 'NOT_FOUND', message: 'room not found', retryable: false },
  };

  it('joins with what the player typed on the start screen and, when that fails, shows it again with a way back', () => {
    const onExit = renderDesktop();

    expect(lastEmission('join room')?.args[0]).toEqual({ name: 'Ada', roomCode: 'LAN-42' });
    answerJoin(roomNotFound);

    // The form is back with an error, and nothing has to be typed again.
    expect(screen.getByRole('alert').textContent).toBe('Không tìm thấy phòng hoặc dữ liệu được yêu cầu.');
    expect(screen.getByLabelText<HTMLInputElement>('Tên của bạn').value).toBe('Ada');
    expect(screen.getByLabelText<HTMLInputElement>('Mã phòng').value).toBe('LAN-42');
    expect(screen.getByRole('radio', { name: 'Có mã phòng' }).getAttribute('aria-checked')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: BACK }));

    expect(onExit).toHaveBeenCalledOnce();
    expect(socketHarness.socket.connected).toBe(false);
    expect(lastEmission('leave room')).toBeUndefined();
  });

  it('can go back from "Phòng chung" with a code that does not exist, and from a join that is still waiting', () => {
    const onExit = renderDesktop();
    answerJoin(roomNotFound);
    fireEvent.click(screen.getByRole('radio', { name: 'Phòng chung' }));
    fireEvent.click(screen.getByRole('button', { name: 'Vào phòng' }));
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Đang vào phòng…' }).disabled).toBe(true);

    // The answer has not come: the way back is still there and does not wait for it.
    fireEvent.click(screen.getByRole('button', { name: BACK }));
    expect(onExit).toHaveBeenCalledOnce();

    // A late answer for a room the player already left must not change the screen.
    answerJoin(roomNotFound);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(lastEmission('resume session')).toBeUndefined();
  });

  it('leaves a session saved for another room alone: going back is a disconnect, not a leave', () => {
    const saved = { token: RECONNECT_TOKEN, roomCode: 'LAN-OLD' };
    window.localStorage.setItem(PLAYER_SESSION_STORAGE_KEY, JSON.stringify({ version: 3, sessions: { [socketUrl]: saved } }));
    const onExit = renderDesktop();
    answerJoin(roomNotFound);

    fireEvent.click(screen.getByRole('button', { name: BACK }));

    expect(onExit).toHaveBeenCalledOnce();
    expect(JSON.parse(window.localStorage.getItem(PLAYER_SESSION_STORAGE_KEY) ?? '{}')).toEqual({
      version: 3,
      sessions: { [socketUrl]: saved },
    });
    expect(lastEmission('leave room')).toBeUndefined();
  });

  it('has no way back where there is no start screen: a plain browser, or no exit given', () => {
    // A plain browser: the join form is the first screen.
    const web = render(<ToastProvider><App /></ToastProvider>);
    expect(screen.queryByRole('button', { name: BACK })).toBeNull();
    web.unmount();

    // The desktop bridge without a way to go back (the app was not started by the launcher).
    renderDesktop(null);
    expect(screen.queryByRole('button', { name: BACK })).toBeNull();
  });

  it('puts "Về trang chủ" beside "Thử lại" when the saved game cannot be confirmed in time', () => {
    vi.useFakeTimers();
    window.localStorage.setItem(PLAYER_SESSION_STORAGE_KEY, JSON.stringify({
      version: 3,
      sessions: { [socketUrl]: { token: RECONNECT_TOKEN, roomCode: 'LAN-42' } },
    }));
    const onExit = renderDesktop();
    expect(lastEmission('resume session')).toBeDefined();

    act(() => { vi.advanceTimersByTime(10_000); });

    expect(screen.getByText('Máy chủ chưa xác nhận phiên chơi kịp thời.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: HOME }));
    expect(onExit).toHaveBeenCalledOnce();
    // The room is not left: the saved session stays, so the player can come back to it from the start screen.
    expect(window.localStorage.getItem(PLAYER_SESSION_STORAGE_KEY)).not.toBeNull();
    expect(lastEmission('leave room')).toBeUndefined();
  });

  it('shows one way home, not two, when the failure already offers it', () => {
    const onExit = renderDesktop();

    act(() => socketHarness.trigger('connect_error', new Error('timeout')));

    expect(screen.getAllByRole('button', { name: HOME })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Thử lại' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: HOME }));
    expect(onExit).toHaveBeenCalledOnce();
  });

  it('is not a dead end when the session was opened somewhere else', () => {
    const onExit = renderDesktop();

    act(() => {
      socketHarness.trigger('session replaced', {
        code: 'SESSION_REPLACED',
        message: 'This session moved to a newer connection.',
      });
    });

    expect(screen.getByRole('heading', { name: 'Phiên chơi đã được mở ở nơi khác' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: HOME }));
    expect(onExit).toHaveBeenCalledOnce();
  });

  it('is still a dead end with no button in a plain browser (nothing to go back to)', () => {
    render(<ToastProvider><App /></ToastProvider>);

    act(() => {
      socketHarness.trigger('session replaced', {
        code: 'SESSION_REPLACED',
        message: 'This session moved to a newer connection.',
      });
    });

    expect(screen.queryByRole('button', { name: HOME })).toBeNull();
  });
});

describe('App how-to-play key placement', () => {
  const GUIDE = 'Hướng dẫn chơi';
  const gameRoom: PublicRoomState = {
    ...room,
    status: 'IN_PROGRESS',
    version: 4,
    gameState: {
      ...room.gameState,
      boardState: { ...room.gameState.boardState, gameStarted: true },
    },
  };

  function renderApp() {
    return render(
      <HowToPlayProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </HowToPlayProvider>,
    );
  }

  function storeSession() {
    window.localStorage.setItem('monopoly.player-session.v1', JSON.stringify({
      version: 1,
      token: RECONNECT_TOKEN,
    }));
  }

  function resumeIntoGame() {
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
  }

  beforeEach(() => {
    socketHarness.reset();
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    delete window.ownTheBlockDesktop;
    window.history.replaceState({}, '', '/');
  });

  it('shows the key on the join screen beside the title, without submitting anything', () => {
    renderApp();

    const key = screen.getByRole('button', { name: GUIDE });
    expect(key.closest('.join__hero')).not.toBeNull();
    expect(key.closest('form.join__form')).toBeNull();
    fireEvent.click(key);
    expect(screen.getByRole('dialog', { name: GUIDE })).toBeTruthy();
    expect(lastEmission('join room')).toBeUndefined();
  });

  it('shows the key on the screen that restores a saved game', () => {
    storeSession();
    renderApp();

    expect(screen.getByText('Đang khôi phục ván chơi…')).toBeTruthy();
    const key = screen.getByRole('button', { name: GUIDE });
    expect(key.closest('section.app-screen--loading')).not.toBeNull();
    expect(key.className).toContain('how-to-play-button--corner');
  });

  it('shows the key in the lobby header', () => {
    storeSession();
    renderApp();
    const resumeAck = lastEmission('resume session')?.args[1];
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
            privatePlayerState: { playerId: 'stable-player-id', heldJailFreeCardIds: [], gameplayEvents: { sequence: 0, events: [] } },
            pendingOffers: [],
          },
        });
      }
    });

    const actions = document.querySelector('.lobby__header-actions') as HTMLElement;
    expect(within(actions).getAllByRole('button')[0]).toBe(screen.getByRole('button', { name: GUIDE }));
  });

  it('puts the key first in the game toolbar, tags the toolbar for the overlap check and opens the guide', () => {
    storeSession();
    renderApp();
    resumeIntoGame();

    const toolbar = document.querySelector('.room-toolbar') as HTMLElement;
    expect(toolbar.getAttribute('data-hud-region')).toBe('toolbar');
    const buttons = within(toolbar).getAllByRole('button');
    expect(buttons.map(button => button.getAttribute('aria-label'))).toEqual([GUIDE, 'Cài đặt', 'Bỏ cuộc']);
    // Every key stays a 44 px design-system key and the toolbar keeps its landmark name.
    expect(buttons.every(button => button.className.includes('ds-icon-button--md'))).toBe(true);
    expect(toolbar.getAttribute('aria-label')).toBe('Điều khiển ván chơi');
    // Settings and Surrender are recognizable glyphs (gear, flag) whose names live on the buttons.
    expect(buttons[1].querySelector('svg')?.getAttribute('class')).toContain('lucide-settings');
    expect(buttons[2].querySelector('svg')?.getAttribute('class')).toContain('lucide-flag');

    fireEvent.click(buttons[0]);
    expect(screen.getByRole('dialog', { name: GUIDE })).toBeTruthy();
    expect(lastEmission('leave room')).toBeUndefined();
  });

  it('keeps the key on the toolbar of a spectator, next to the leave key', () => {
    renderApp();
    fireEvent.change(screen.getByLabelText('Tên của bạn'), { target: { value: 'Viewer' } });
    fireEvent.change(screen.getByLabelText('Mã phòng'), { target: { value: 'room-42' } });
    fireEvent.click(screen.getByRole('button', { name: 'Vào phòng' }));
    const joinAck = lastEmission('join room')?.args[1];
    act(() => {
      if (isAckCallback(joinAck)) {
        joinAck({
          ok: true,
          protocolVersion: SOCKET_PROTOCOL_VERSION,
          revision: gameRoom.version,
          data: {
            kind: 'SPECTATOR',
            role: 'SPECTATOR',
            playerId: null,
            room: { ...gameRoom, hostPlayerId: 'another-player' },
          },
        });
      }
    });

    const toolbar = document.querySelector('.room-toolbar') as HTMLElement;
    expect(within(toolbar).getAllByRole('button').map(button => button.getAttribute('aria-label')))
      .toEqual([GUIDE, 'Cài đặt', 'Rời phòng']);
  });

  it('keeps the key on the screen of a session that was opened elsewhere', () => {
    renderApp();
    act(() => {
      socketHarness.trigger('session replaced', {
        code: 'SESSION_REPLACED',
        message: 'This session moved to a newer connection.',
      });
    });

    expect(screen.getByRole('heading', { name: 'Phiên chơi đã được mở ở nơi khác' })).toBeTruthy();
    const key = screen.getByRole('button', { name: GUIDE });
    expect(key.closest('.app-screen--error')).not.toBeNull();
  });

  it('keeps the key on the reconnecting screen, outside the status the overlay announces', () => {
    storeSession();
    renderApp();
    resumeIntoGame();
    act(() => { socketHarness.trigger('disconnect', 'transport close'); });

    const overlay = document.querySelector('.connection-overlay') as HTMLElement;
    expect(overlay).not.toBeNull();
    const status = within(overlay).getByRole('status');
    expect(status.textContent).toBe('Đã mất kết nối. Đang kết nối lại vào ván chơi…');
    const key = within(overlay).getByRole('button', { name: GUIDE });
    expect(status.contains(key)).toBe(false);

    fireEvent.click(key);
    expect(screen.getByRole('dialog', { name: GUIDE })).toBeTruthy();
  });

  it('after a long outage follows a pasted new link of the same room, moving only the stored token', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      storeSession();
      const onSwitchEndpoint = vi.fn();
      render(
        <HowToPlayProvider>
          <ToastProvider>
            <App onSwitchEndpoint={onSwitchEndpoint} />
          </ToastProvider>
        </HowToPlayProvider>,
      );
      resumeIntoGame();
      act(() => { socketHarness.trigger('disconnect', 'transport close'); });
      expect(screen.queryByLabelText('Link mời mới của phòng')).toBeNull();
      act(() => { vi.advanceTimersByTime(RECONNECT_STALL_MS); });

      fireEvent.change(screen.getByLabelText('Link mời mới của phòng'), {
        target: { value: `https://new-host.trycloudflare.com/?room=${gameRoom.roomCode}` },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Kết nối bằng link này' }));
      expect(onSwitchEndpoint).toHaveBeenCalledWith('https://new-host.trycloudflare.com', gameRoom.roomCode);
      const stored = JSON.parse(window.localStorage.getItem(PLAYER_SESSION_STORAGE_KEY) ?? '{}') as {
        sessions?: Record<string, { token: string; roomCode: string | null }>;
      };
      expect(stored.sessions?.['https://new-host.trycloudflare.com']).toEqual({ token: RECONNECT_TOKEN, roomCode: gameRoom.roomCode });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('App 2v2 lobby commands', () => {
  const HOST_ID = 'stable-player-id';

  /** Ada (the viewer, host, Team 1 seat 0), Bình (Team 2 seat 0) and Chi (Team 1 seat 1): the second seat of Team 2 is empty. */
  function teamLobbyRoom(version: number, overrides: {
    requests?: PublicRoomState['gameState']['boardState']['seatSwapRequests'];
    hostPlayerId?: string;
  } = {}): PublicRoomState {
    const seats = [
      { playerId: HOST_ID, name: 'Ada', color: 'red' as const, characterId: 'dog' as const, teamId: 'TEAM_1' as const, teamSlot: 0 as const },
      { playerId: 'player-b', name: 'Bình', color: 'blue' as const, characterId: 'panda' as const, teamId: 'TEAM_2' as const, teamSlot: 0 as const },
      { playerId: 'player-c', name: 'Chi', color: 'red' as const, characterId: 'cat' as const, teamId: 'TEAM_1' as const, teamSlot: 1 as const },
    ];
    return {
      ...room,
      version,
      hostPlayerId: overrides.hostPlayerId ?? HOST_ID,
      players: seats.map((seat, index) => ({
        ...seat, joinOrder: index, membershipStatus: 'ACTIVE' as const, ready: false, connected: true, kind: 'HUMAN' as const,
      })),
      gameState: {
        ...room.gameState,
        boardState: {
          ...room.gameState.boardState,
          gameMode: 'TEAM_2V2',
          teams: [
            { teamId: 'TEAM_1', name: 'Team 1', color: 'red', memberPlayerIds: [HOST_ID, 'player-c'] },
            { teamId: 'TEAM_2', name: 'Team 2', color: 'blue', memberPlayerIds: ['player-b'] },
          ],
          seatSwapRequests: overrides.requests ?? [],
        },
      },
    };
  }

  function renderApp() {
    return render(
      <ToastProvider>
        <App />
      </ToastProvider>,
    );
  }

  /** Resumes a stored session into the given lobby room as `playerId`. */
  function enterLobby(lobbyRoom: PublicRoomState, playerId = HOST_ID) {
    window.localStorage.setItem(PLAYER_SESSION_STORAGE_KEY, JSON.stringify({
      version: 3,
      sessions: { 'http://localhost:3000': { token: RECONNECT_TOKEN, roomCode: lobbyRoom.roomCode } },
    }));
    const view = renderApp();
    const resumeAck = lastEmission('resume session')?.args[1];
    act(() => {
      if (isAckCallback(resumeAck)) {
        resumeAck({
          ok: true,
          protocolVersion: SOCKET_PROTOCOL_VERSION,
          revision: lobbyRoom.version,
          data: {
            role: 'PLAYER',
            playerId,
            room: lobbyRoom,
            privatePlayerState: { playerId, heldJailFreeCardIds: [], gameplayEvents: { sequence: 0, events: [] } },
            pendingOffers: [],
          },
        });
      }
    });
    return view;
  }

  /** Answers the last emission of `event` with success, the way the server does after it committed. */
  function acknowledge(event: string, response: unknown = { ok: true, protocolVersion: SOCKET_PROTOCOL_VERSION }) {
    const emission = lastEmission(event);
    const ack = emission?.args[emission.args.length - 1];
    act(() => {
      if (isAckCallback(ack)) ack(response);
    });
  }

  beforeEach(() => {
    socketHarness.reset();
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    delete window.ownTheBlockDesktop;
    window.history.replaceState({}, '', '/');
  });

  it('sends the mode, the own team name and the colour with only the fields the player chose, and shows a refusal in the lobby', () => {
    enterLobby(teamLobbyRoom(1));

    // The host switches mode: only the chosen mode is sent, and the lobby keeps working while the ACK is awaited.
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Chế độ chơi' })).getByRole('radio', { name: 'Solo' }));
    expect(lastEmission('set game mode')?.args[0]).toEqual({ mode: 'SOLO' });
    acknowledge('set game mode', {
      ok: false,
      protocolVersion: SOCKET_PROTOCOL_VERSION,
      error: { code: 'CONFLICT', message: 'Chỉ chủ phòng mới đổi được chế độ.', retryable: false },
    });
    expect(screen.getByRole('alert').textContent).toBe('Giao dịch chưa thể thực hiện.');

    // Only the name travels: the server renames the sender's own team, the client never names a team.
    const nameField = screen.getByLabelText('Tên đội');
    fireEvent.change(nameField, { target: { value: 'Rồng' } });
    fireEvent.keyDown(nameField, { key: 'Enter' });
    expect(lastEmission('set team name')?.args[0]).toEqual({ name: 'Rồng' });
    acknowledge('set team name');

    fireEvent.click(within(screen.getByRole('group', { name: 'Màu của đội Team 1' })).getByRole('button', { name: 'Xanh lá' }));
    expect(lastEmission('set team color')?.args[0]).toEqual({ color: 'green' });
  });

  it('lets only the own team be renamed: the host edits their team and reads the other one', () => {
    enterLobby(teamLobbyRoom(1));

    expect(screen.getAllByLabelText('Tên đội')).toHaveLength(1);
    expect(within(screen.getByRole('region', { name: 'Team 2' })).queryByLabelText('Tên đội')).toBeNull();
  });

  it('moves to an empty seat with the team and the seat number', () => {
    enterLobby(teamLobbyRoom(1));

    fireEvent.click(screen.getByRole('button', { name: 'Chuyển sang chỗ trống 2 của đội Team 2' }));

    expect(lastEmission('move to seat')?.args[0]).toEqual({ teamId: 'TEAM_2', teamSlot: 1 });
    // The lobby only changes with the committed update: the seat is still empty until the room says otherwise.
    expect(screen.getByText('Chỗ trống 2')).toBeTruthy();
  });

  it('asks another player to swap and shows the wait that the room state holds, then takes the request back', () => {
    enterLobby(teamLobbyRoom(1));

    fireEvent.click(screen.getByRole('button', { name: 'Đổi chỗ với Bình' }));
    expect(lastEmission('request seat swap')?.args[0]).toEqual({ targetPlayerId: 'player-b' });
    acknowledge('request seat swap');
    // Nothing is shown from the click: the pending state exists only once the room lists the request.
    expect(screen.queryByText('Đang chờ Bình trả lời')).toBeNull();

    act(() => { socketHarness.trigger('update', teamLobbyRoom(2, { requests: [{ requesterPlayerId: HOST_ID, targetPlayerId: 'player-b' }] })); });
    expect(screen.getByText('Đang chờ Bình trả lời')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Hủy yêu cầu đổi chỗ với Bình' }));
    const cancel = lastEmission('cancel seat swap');
    // Cancelling carries no payload: the acknowledgement is the only argument.
    expect(cancel?.args).toHaveLength(1);
    expect(isAckCallback(cancel?.args[0])).toBe(true);
  });

  it('answers a request addressed to the viewer from the central dialog, naming the requester', async () => {
    enterLobby(teamLobbyRoom(1, { requests: [{ requesterPlayerId: 'player-b', targetPlayerId: HOST_ID }] }));

    const dialog = screen.getByRole('alertdialog', { name: 'Bình muốn đổi chỗ với bạn' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Đồng ý' }));
    expect(lastEmission('respond seat swap')?.args[0]).toEqual({ requesterPlayerId: 'player-b', accept: true });
    acknowledge('respond seat swap');

    // The room commits the swap: the request is gone and the dialog goes with it, with no local state to clear.
    act(() => { socketHarness.trigger('update', teamLobbyRoom(2)); });
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });

  it('declines a request with "Từ chối"', () => {
    enterLobby(teamLobbyRoom(1, { requests: [{ requesterPlayerId: 'player-b', targetPlayerId: HOST_ID }] }));

    fireEvent.click(screen.getByRole('button', { name: 'Từ chối' }));

    expect(lastEmission('respond seat swap')?.args[0]).toEqual({ requesterPlayerId: 'player-b', accept: false });
  });

  it('tells the viewer when their request ended without a swap', async () => {
    enterLobby(teamLobbyRoom(1, { requests: [{ requesterPlayerId: HOST_ID, targetPlayerId: 'player-b' }] }));

    act(() => { socketHarness.trigger('update', teamLobbyRoom(2)); });

    expect(await screen.findByText('Yêu cầu đổi chỗ đã kết thúc.')).toBeTruthy();
  });

  it('shows the refusal of a seat command in the lobby', () => {
    enterLobby(teamLobbyRoom(1));

    fireEvent.click(screen.getByRole('button', { name: 'Chuyển sang chỗ trống 2 của đội Team 2' }));
    acknowledge('move to seat', {
      ok: false,
      protocolVersion: SOCKET_PROTOCOL_VERSION,
      error: { code: 'CONFLICT', message: 'Chỗ này vừa có người ngồi. Hãy chọn lại.', retryable: false },
    });

    expect(screen.getByRole('alert').textContent).toBe('Giao dịch chưa thể thực hiện.');
  });

  it('kicks a player only after the host confirms, sending the stable player id', () => {
    enterLobby(teamLobbyRoom(1));

    fireEvent.click(screen.getByRole('button', { name: 'Mời Bình ra khỏi phòng' }));
    expect(screen.getByRole('alertdialog', { name: 'Mời Bình ra khỏi phòng?' })).toBeTruthy();
    expect(lastEmission('kick player')).toBeUndefined();

    fireEvent.click(screen.getByRole('button', { name: 'Mời ra' }));
    expect(lastEmission('kick player')?.args[0]).toEqual({ playerId: 'player-b' });
  });

  it('gives a guest no kick key', () => {
    enterLobby(teamLobbyRoom(1, { hostPlayerId: 'player-b' }));

    expect(screen.queryByRole('button', { name: /ra khỏi phòng/u })).toBeNull();
  });

  describe('being removed by the host', () => {
    function removedFromRoom() {
      act(() => {
        socketHarness.trigger('removed from room', { code: 'REMOVED_BY_HOST', message: 'Chủ phòng đã mời bạn ra khỏi phòng.' });
      });
    }

    it('ends the session like a revoked one: the failure screen, the stored session cleared and no more resuming', () => {
      enterLobby(teamLobbyRoom(1), 'player-c');
      expect(window.localStorage.getItem(PLAYER_SESSION_STORAGE_KEY)).not.toBeNull();
      const resumes = socketHarness.emissions.filter(emission => emission.event === 'resume session').length;

      removedFromRoom();

      expect(screen.getByRole('heading', { name: 'Bạn đã được mời ra khỏi phòng' })).toBeTruthy();
      expect(screen.getByText('Chủ phòng đã mời bạn ra khỏi phòng.')).toBeTruthy();
      expect(window.localStorage.getItem(PLAYER_SESSION_STORAGE_KEY)).toBeNull();
      expect(screen.queryByRole('heading', { name: 'ROOM-42' })).toBeNull();
      // A later connection must not try the revoked token again.
      act(() => { socketHarness.socket.disconnect(); });
      act(() => { socketHarness.socket.connect(); });
      expect(socketHarness.emissions.filter(emission => emission.event === 'resume session')).toHaveLength(resumes);
    });

    it('offers "Quay về màn hình vào phòng" and it leads back to the join form', () => {
      enterLobby(teamLobbyRoom(1), 'player-c');
      removedFromRoom();

      fireEvent.click(screen.getByRole('button', { name: 'Quay về màn hình vào phòng' }));

      expect(screen.getByLabelText('Mã phòng')).toBeTruthy();
      expect(screen.queryByText('Chủ phòng đã mời bạn ra khỏi phòng.')).toBeNull();
    });

    it('returns to the launcher on desktop, like a terminal session error', () => {
      const socketUrl = 'http://192.168.1.15:8080';
      const runtimeConfig = {
        target: 'desktop' as const,
        socketUrl,
        platform: 'win32' as const,
        appVersion: '3.0.0',
      };
      const onExitToLauncher = vi.fn();
      window.ownTheBlockDesktop = {
        quit: { onQuitRequested: () => () => undefined, respond: vi.fn() },
      } as unknown as OwnTheBlockDesktopBridge;
      window.localStorage.setItem(PLAYER_SESSION_STORAGE_KEY, JSON.stringify({
        version: 3,
        sessions: { [socketUrl]: { token: RECONNECT_TOKEN, roomCode: 'ROOM-42' } },
      }));
      render(
        <ToastProvider>
          <App
            runtimeConfig={runtimeConfig}
            launch={{ runtimeConfig, initialJoin: { name: 'Chi', roomCode: 'ROOM-42' }, targetRoomCode: 'ROOM-42', hosting: false }}
            onExitToLauncher={onExitToLauncher}
          />
        </ToastProvider>,
      );
      const resumeAck = lastEmission('resume session')?.args[1];
      const lobbyRoom = teamLobbyRoom(1);
      act(() => {
        if (isAckCallback(resumeAck)) {
          resumeAck({
            ok: true,
            protocolVersion: SOCKET_PROTOCOL_VERSION,
            revision: 1,
            data: {
              role: 'PLAYER',
              playerId: 'player-c',
              room: lobbyRoom,
              privatePlayerState: { playerId: 'player-c', heldJailFreeCardIds: [], gameplayEvents: { sequence: 0, events: [] } },
              pendingOffers: [],
            },
          });
        }
      });

      removedFromRoom();

      expect(window.localStorage.getItem(PLAYER_SESSION_STORAGE_KEY)).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Về trang chủ' }));
      expect(onExitToLauncher).toHaveBeenCalledOnce();
    });

    it('stops listening to the event when the app unmounts', () => {
      const view = renderApp();
      expect(socketHarness.listenerCount('removed from room')).toBe(1);

      view.unmount();

      expect(socketHarness.listenerCount('removed from room')).toBe(0);
    });
  });
});

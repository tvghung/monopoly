import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import type { PrivatePlayerState, PublicRoomState } from '@monopoly/shared';
import { SOCKET_PROTOCOL_VERSION } from '@monopoly/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StateContextValue } from './types';

type SocketHandler = (...args: unknown[]) => void;

// Same transport convention as App.test.tsx: every server delivery/ACK is an explicit synchronous barrier.
const socketHarness = vi.hoisted(() => {
  const handlers = new Map<string, Set<SocketHandler>>();
  const emissions: Array<{ event: string; args: unknown[] }> = [];
  const socket = {
    id: 'e1-transport-only', connected: false, auth: {}, io: { reconnection: vi.fn() },
    on(event: string, handler: SocketHandler) {
      const listeners = handlers.get(event) ?? new Set<SocketHandler>();
      listeners.add(handler);
      handlers.set(event, listeners);
      return socket;
    },
    off(event: string, handler: SocketHandler) { handlers.get(event)?.delete(handler); return socket; },
    emit(event: string, ...args: unknown[]) { emissions.push({ event, args }); return socket; },
    connect() { socket.connected = true; handlers.get('connect')?.forEach(handler => handler()); return socket; },
    disconnect() {
      socket.connected = false;
      handlers.get('disconnect')?.forEach(handler => handler('io client disconnect'));
      return socket;
    },
  };
  return {
    socket, emissions,
    trigger(event: string, ...args: unknown[]) { handlers.get(event)?.forEach(handler => handler(...args)); },
    reset() { handlers.clear(); emissions.length = 0; socket.connected = false; socket.io.reconnection.mockReset(); },
    listenerCount(event: string) { return handlers.get(event)?.size ?? 0; },
  };
});
const observation = vi.hoisted(() => ({ current: null as StateContextValue | null, renders: 0 }));
vi.mock('socket.io-client', () => ({ io: () => socketHarness.socket }));

// Keep the actual scene boundary and all actual Lobby/Board/HUD consumers. The added leaf only observes App's public context;
// no copy of applyRoom, version ordering, projection, presentation derivation or UI behavior lives in this test.
vi.mock('./components/sceneLayer/SceneLayer', async (importOriginal) => {
  const original = await importOriginal<typeof import('./components/sceneLayer/SceneLayer')>();
  const { createElement, useContext } = await import('react');
  const { default: stateContext } = await import('./internal');
  function ReplicaProbe() { observation.current = useContext(stateContext); observation.renders += 1; return null; }
  return {
    ...original,
    default: (props: ComponentProps<typeof original.default>) => createElement(
      original.default,
      props,
      createElement(ReplicaProbe),
      props.children,
    ),
  };
});

import App from './App';
import { ToastProvider } from './components/Toast';
import { PLAYER_SESSION_STORAGE_KEY } from './playerSessionStorage';
import { PresentationController } from './game/presentation/PresentationController';
import { cloneRoom, makeRoom } from './game/presentation/testFixtures';

const PLAYER = 'player-a';
const OTHER = 'player-b';
const TOKEN = 'E'.repeat(43);

function replica(): StateContextValue {
  expect(observation.current).not.toBeNull();
  return observation.current as StateContextValue;
}
function lastAck(event: string): (response: unknown) => void {
  const emission = socketHarness.emissions.slice().reverse().find(item => item.event === event);
  const ack = emission?.args.at(-1);
  expect(typeof ack, event + ' ACK must be registered').toBe('function');
  return ack as (response: unknown) => void;
}
function acknowledgePlayer(room: PublicRoomState) {
  act(() => lastAck('resume session')({
    ok: true, protocolVersion: SOCKET_PROTOCOL_VERSION, revision: room.version,
    data: {
      role: 'PLAYER', playerId: PLAYER, room,
      privatePlayerState: { playerId: PLAYER, heldJailFreeCardIds: [], gameplayEvents: { sequence: 0, events: [] } },
      pendingOffers: [],
    },
  }));
}
function mountPlayer(room: PublicRoomState) {
  window.localStorage.setItem(PLAYER_SESSION_STORAGE_KEY, JSON.stringify({
    version: 3, sessions: { 'http://localhost:3000': { token: TOKEN, roomCode: room.roomCode } },
  }));
  const view = render(<ToastProvider><App /></ToastProvider>);
  acknowledgePlayer(room);
  return view;
}
function mountSpectator(room: PublicRoomState) {
  const view = render(<ToastProvider><App /></ToastProvider>);
  joinSpectator(room);
  return view;
}
function joinSpectator(room: PublicRoomState) {
  fireEvent.change(screen.getByLabelText('Tên của bạn'), { target: { value: 'E1 Viewer' } });
  fireEvent.change(screen.getByLabelText('Mã phòng'), { target: { value: room.roomCode } });
  fireEvent.click(screen.getByRole('button', { name: 'Vào phòng' }));
  act(() => lastAck('join room')({
    ok: true, protocolVersion: SOCKET_PROTOCOL_VERSION, revision: room.version,
    data: { kind: 'SPECTATOR', role: 'SPECTATOR', playerId: null, room },
  }));
  expect(screen.getByText(/Chế độ Khán Giả/u)).toBeTruthy();
}
function deliver(room: PublicRoomState) { act(() => socketHarness.trigger('update', room)); }
function setPresence(room: PublicRoomState, connected: boolean, version = room.version): PublicRoomState {
  const next = cloneRoom(room, version);
  next.players.find(player => player.playerId === OTHER)!.connected = connected;
  return next;
}
function expectPresence(connected: boolean) {
  const lobbySeat = document.querySelector<HTMLElement>('.lobby-player[data-player-id="player-b"]');
  if (lobbySeat) {
    expect(lobbySeat.classList.contains('lobby-player--disconnected')).toBe(!connected);
  } else {
    const hudCard = document.querySelector<HTMLElement>('.player-card[data-player-id="player-b"]');
    expect(hudCard, 'actual HUD card must render the non-current human').not.toBeNull();
    expect(hudCard?.dataset.state).toBe(connected ? 'playing' : 'offline');
  }
  expect(replica().roomPlayers?.find(player => player.playerId === OTHER)?.connected).toBe(connected);
}
function roomWithHistory(): PublicRoomState {
  const room = makeRoom(20);
  room.gameState.boardState.rollSequence = 7;
  room.gameState.boardState.diceValue = { dice1: 3, dice2: 4 };
  room.gameState.players[PLAYER].currentTile = 7;
  room.gameState.players[PLAYER].accountBalance = 1475;
  room.gameState.boardState.gameplayEvents = {
    sequence: 1, events: [{
      eventId: 'settled-money', sequence: 1, type: 'MONEY_TRANSFER',
      source: { kind: 'PLAYER', playerId: PLAYER }, destination: { kind: 'BANK' }, amount: 25, reason: 'CARD',
    }],
  };
  room.gameState.turnInfo.pendingCardInteraction = {
    operationId: 'settled-card', playerId: PLAYER, turnNumber: 1, deck: 'chance', sourceTile: 7,
    stage: 'REVEALED', revealedCardId: 'chance-advance-start',
    continuation: { playerId: PLAYER, turnNumber: 1 }, deadlineAt: '2099-01-01T00:00:00.000Z',
  };
  return room;
}


describe('App volatile presence safety (E1-FIX-001)', () => {
  beforeEach(() => {
    socketHarness.reset();
    observation.current = null;
    observation.renders = 0;
    window.localStorage.clear();
    window.history.replaceState({}, '', '/');
  });
  afterEach(async () => {
    cleanup();
    await Promise.resolve(); // The real PresentationController releases on a microtask.
    expect(socketHarness.listenerCount('update')).toBe(0);
    expect(socketHarness.listenerCount('private player state')).toBe(0);
    vi.restoreAllMocks();
    vi.useRealTimers();
    window.localStorage.clear();
    window.history.replaceState({}, '', '/');
  });

  it('renders repeated same-version presence flips, preserves gameplay and skips duplicate renders', () => {
    const room = makeRoom(10);
    room.status = 'LOBBY';
    room.gameState.boardState.gameStarted = false;
    room.gameState.boardState.currentPlayer = { id: '', hasMoved: false };
    mountPlayer(room);
    const game = replica().state;
    const initialPlayers = replica().roomPlayers!;
    const accepted = vi.spyOn(PresentationController.prototype, 'acceptRoomSnapshot');
    const emissions = socketHarness.emissions.length;
    for (const connected of [false, true, false, true]) {
      const before = observation.renders;
      deliver(setPresence(room, connected));
      expectPresence(connected);
      expect(observation.renders).toBeGreaterThan(before);
      expect(replica().state).toBe(game);
      expect(replica().roomPlayers![0]).toBe(initialPlayers[0]);
      const players = replica().roomPlayers;
      const after = observation.renders;
      deliver(setPresence(room, connected));
      expect(replica().roomPlayers).toBe(players);
      expect(observation.renders).toBe(after);
    }
    expect(accepted).not.toHaveBeenCalled();
    expect(socketHarness.emissions).toHaveLength(emissions);
  });

  it('updates host start readiness across equal-version disconnect and reconnect without emitting start', () => {
    const room = makeRoom(11);
    room.status = 'LOBBY';
    room.gameState.boardState.gameStarted = false;
    room.gameState.boardState.currentPlayer = { id: '', hasMoved: false };
    mountPlayer(room);
    expect(room.players.every(player => player.ready && player.characterId && player.connected)).toBe(true);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Bắt đầu' }).disabled).toBe(false);
    const emissions = socketHarness.emissions.length;
    deliver(setPresence(room, false));
    const start = screen.getByRole<HTMLButtonElement>('button', { name: 'Bắt đầu' });
    expect(start.disabled).toBe(true);
    fireEvent.click(start);
    deliver(setPresence(room, true));
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Bắt đầu' }).disabled).toBe(false);
    expect(socketHarness.emissions).toHaveLength(emissions);
  });

  it('merges only connected and rejects equal-version gameplay, room and member field injection', () => {
    const room = roomWithHistory();
    mountPlayer(room);
    const game = replica().state;
    const originalPlayers = replica().roomPlayers!;
    const incoming = setPresence(room, false);
    incoming.gameState.players[PLAYER].accountBalance = 1;
    incoming.gameState.players[PLAYER].currentTile = 39;
    incoming.gameState.players[PLAYER].getOutOfJailCardCount = 99;
    incoming.gameState.boardState.currentPlayer = { id: OTHER, hasMoved: true };
    incoming.gameState.boardState.turnNumber = 99;
    incoming.gameState.boardState.ownedProps = { 1: { id: OTHER, color: 'blue', houses: 5 } };
    incoming.gameState.boardState.rollSequence = 99;
    incoming.gameState.boardState.diceValue = { dice1: 6, dice2: 6 };
    incoming.gameState.turnInfo.pendingCardInteraction!.operationId = 'injected-card';
    incoming.gameState.boardState.paymentShortfall = {
      debtorPlayerId: PLAYER, creditor: 'BANK', amount: 9000, remainingAmount: 9000,
      source: { kind: 'RENT', tileID: 1 }, actionDeadlineAt: '2099-01-01T00:00:00.000Z',
      remainingClaimCount: 1, paymentOperationId: 'injected-payment', claimId: 'injected-claim',
      sellableProperties: [], rescue: null,
    };
    Object.assign(incoming.players[1], {
      name: 'Injected', color: 'green', characterId: 'cat', ready: false,
      teamId: 'TEAM_1', teamSlot: 1, joinOrder: 99,
    });
    incoming.hostPlayerId = OTHER;
    incoming.status = 'FINISHED';
    incoming.maxPlayers = 99;
    incoming.minPlayers = 99;
    const accepted = vi.spyOn(PresentationController.prototype, 'acceptRoomSnapshot');
    const emissions = socketHarness.emissions.length;
    deliver(incoming);
    expectPresence(false);
    expect(replica().state).toBe(game);
    expect(replica().state).toEqual(room.gameState);
    expect(replica().roomPlayers).toEqual([originalPlayers[0], { ...originalPlayers[1], connected: false }]);
    expect(replica().roomStatus).toBe('IN_PROGRESS');
    expect(replica().hostPlayerId).toBe(PLAYER);
    expect(accepted).not.toHaveBeenCalled();
    expect(socketHarness.emissions).toHaveLength(emissions);
  });

  it('matches presence by playerId while retaining authoritative roster order and missing members', () => {
    const room = makeRoom(20);
    mountPlayer(room);
    const players = replica().roomPlayers!;
    const incoming = setPresence(room, false);
    incoming.players = [
      { ...incoming.players[1], name: 'Ignored member fields' },
      { ...incoming.players[0], playerId: 'unknown-player', connected: false },
    ];
    deliver(incoming);
    expect(replica().roomPlayers).toEqual([players[0], { ...players[1], connected: false }]);
    expect(replica().roomPlayers![0]).toBe(players[0]);
    expectPresence(false);
  });

  it('keeps active bots connected and rejects changed kind or inactive member presence', () => {
    const room = makeRoom(21);
    room.players.push({ ...room.players[1], playerId: 'bot', kind: 'BOT', name: 'Bot', joinOrder: 2 });
    room.players.push({ ...room.players[1], playerId: 'left-player', membershipStatus: 'LEFT', connected: false });
    mountPlayer(room);
    const players = replica().roomPlayers!;
    const incoming = cloneRoom(room, room.version);
    incoming.players[1].kind = 'BOT';
    incoming.players[1].connected = false;
    incoming.players[2].kind = 'HUMAN';
    incoming.players[2].connected = false;
    incoming.players[3].membershipStatus = 'ACTIVE';
    incoming.players[3].connected = true;
    deliver(incoming);
    expect(replica().roomPlayers).toBe(players);
    expect(replica().roomPlayers!.find(player => player.playerId === 'bot')!.connected).toBe(true);
    expectPresence(true);
    incoming.players[1].kind = 'HUMAN';
    incoming.players[1].membershipStatus = 'LEFT';
    deliver(incoming);
    expect(replica().roomPlayers).toBe(players);
  });

  it('rejects lower versions even when their presence looks newer', () => {
    const current = setPresence(makeRoom(30), false);
    mountPlayer(current);
    const context = replica();
    const renders = observation.renders;
    const stale = setPresence(current, true, 29);
    stale.gameState.players[PLAYER].accountBalance = 999999;
    stale.gameState.boardState.currentPlayer.id = OTHER;
    deliver(stale);
    expect(replica()).toBe(context);
    expect(observation.renders).toBe(renders);
    expectPresence(false);
  });

  it.each(['roomId', 'roomCode'] as const)('ignores foreign live snapshots with a mismatched %s, even at a higher version', (field) => {
    const room = makeRoom(40);
    mountPlayer(room);
    const context = replica();
    const accepted = vi.spyOn(PresentationController.prototype, 'acceptRoomSnapshot');
    for (const version of [40, 999]) {
      const foreign = setPresence(room, false, version);
      foreign[field] = field === 'roomId' ? 'recreated-room' : 'ANOTHER-CODE';
      foreign.gameState.players[PLAYER].accountBalance = 1;
      deliver(foreign);
      expect(replica()).toBe(context);
      expectPresence(true);
    }
    expect(accepted).not.toHaveBeenCalled();
  });

  it('lets a guarded resume ACK replace room identity, then ignores old-room packets with a reused display code', () => {
    const oldRoom = makeRoom(50);
    mountPlayer(oldRoom);
    act(() => { socketHarness.socket.disconnect(); });
    act(() => { socketHarness.socket.connect(); });
    const newRoom = setPresence(oldRoom, false, 1);
    newRoom.roomId = 'new-room-with-reused-code';
    newRoom.gameState.players[PLAYER].accountBalance = 777;
    acknowledgePlayer(newRoom);
    expectPresence(false);
    expect(replica().state).toBe(newRoom.gameState);
    const context = replica();
    deliver(setPresence(oldRoom, true, 999));
    expect(replica()).toBe(context);
    expectPresence(false);
  });

  it('does not resurrect a departed member through a same-version roster update', () => {
    const room = makeRoom(60);
    mountPlayer(room);
    const removed = cloneRoom(room, 61);
    removed.players = [removed.players[0]];
    delete removed.gameState.players[OTHER];
    removed.gameState.boardState.players = [PLAYER];
    deliver(removed);
    const players = replica().roomPlayers;
    const staleRoster = cloneRoom(room, 61);
    deliver(staleRoster);
    expect(replica().roomPlayers).toBe(players);
    expect(replica().roomPlayers!.map(player => player.playerId)).toEqual([PLAYER]);
    expect(replica().state).toBe(removed.gameState);
  });

  it('keeps a left room cleared and isolates a later admission from old presence packets', () => {
    const oldRoom = makeRoom(70);
    mountSpectator(oldRoom);
    fireEvent.click(document.querySelector<HTMLButtonElement>('.room-toolbar .room-exit-button')!);
    act(() => lastAck('leave room')({ ok: true, protocolVersion: SOCKET_PROTOCOL_VERSION, data: { roomDeleted: false } }));
    expect(screen.getByRole('button', { name: 'Vào phòng' })).toBeTruthy();
    const accepted = vi.spyOn(PresentationController.prototype, 'acceptRoomSnapshot');
    deliver(setPresence(oldRoom, false, 999));
    expect(accepted).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Vào phòng' })).toBeTruthy();
    const nextRoom = setPresence(oldRoom, false, 1);
    nextRoom.roomId = 'new-admission';
    joinSpectator(nextRoom);
    expectPresence(false);
    const context = replica();
    deliver(setPresence(oldRoom, true, 1000));
    expect(replica()).toBe(context);
    expectPresence(false);
  });

  it.each(['disconnected', 'replaced'] as const)('rejects retained deliveries from a %s transport/session', (state) => {
    const room = makeRoom(80);
    mountPlayer(room);
    if (state === 'replaced') {
      act(() => socketHarness.trigger('session replaced', { code: 'SESSION_REPLACED', message: 'new owner' }));
      // A retained callback must remain rejected even if its transport reports connected again.
      socketHarness.socket.connected = true;
    } else act(() => { socketHarness.socket.disconnect(); });
    const accepted = vi.spyOn(PresentationController.prototype, 'acceptRoomSnapshot');
    const context = replica();
    deliver(setPresence(room, false, 81));
    expect(accepted).not.toHaveBeenCalled();
    expect(replica()).toBe(context);
    expect(replica().roomPlayers!.find(player => player.playerId === OTHER)!.connected).toBe(true);
  });

  it('rejects an older resume callback after a newer attempt accepted a live session', () => {
    const room = makeRoom(90);
    mountPlayer(room);
    act(() => { socketHarness.socket.disconnect(); });
    act(() => { socketHarness.socket.connect(); });
    const staleAck = lastAck('resume session');
    act(() => { socketHarness.socket.disconnect(); });
    act(() => { socketHarness.socket.connect(); });
    acknowledgePlayer(setPresence(room, false, 91));
    const context = replica();
    const accepted = vi.spyOn(PresentationController.prototype, 'acceptRoomSnapshot');
    act(() => staleAck({
      ok: true, protocolVersion: SOCKET_PROTOCOL_VERSION, revision: 999,
      data: { role: 'PLAYER', playerId: PLAYER, room: setPresence(room, true, 999),
        privatePlayerState: { playerId: PLAYER, heldJailFreeCardIds: [], gameplayEvents: { sequence: 0, events: [] } },
        pendingOffers: [] },
    }));
    expect(replica()).toBe(context);
    expectPresence(false);
    expect(accepted).not.toHaveBeenCalled();
  });

  it('retains equal-version live presence delivered while resume is pending when its older ACK arrives', () => {
    const room = makeRoom(100);
    mountPlayer(room);
    act(() => { socketHarness.socket.disconnect(); });
    act(() => { socketHarness.socket.connect(); });
    const accepted = vi.spyOn(PresentationController.prototype, 'acceptRoomSnapshot');
    deliver(setPresence(room, false));
    expectPresence(false);
    const players = replica().roomPlayers;
    acknowledgePlayer(room); // Snapshot was captured before the ordered live disconnect projection.
    expectPresence(false);
    expect(replica().roomPlayers).toBe(players);
    expect(replica().canMutate).toBe(true);
    expect(accepted).not.toHaveBeenCalled();
  });

  it('updates spectator HUD presence without private hydration or gameplay emissions', () => {
    const room = makeRoom(110);
    mountSpectator(room);
    const emissions = socketHarness.emissions.length;
    const privateState: PrivatePlayerState = {
      playerId: PLAYER, heldJailFreeCardIds: ['chance-jail-free'], gameplayEvents: { sequence: 0, events: [] },
    };
    act(() => socketHarness.trigger('private player state', privateState));
    for (const connected of [false, true]) {
      deliver(setPresence(room, connected));
      expectPresence(connected);
    }
    expect(replica().role).toBe('SPECTATOR');
    expect(replica().canMutate).toBe(false);
    expect(replica().privatePlayerState).toBeNull();
    expect(replica().privateOffers).toEqual([]);
    expect(socketHarness.emissions).toHaveLength(emissions);
  });

  it('preserves newer authoritative recovery while accepting non-current same-version presence', () => {
    const room = makeRoom(120);
    mountPlayer(room);
    const recovery = cloneRoom(room, 121);
    recovery.players[0].connected = false;
    recovery.gameState.boardState.turnRecovery = { playerId: PLAYER, deadlineAt: '2099-01-01T00:00:00.000Z' };
    deliver(recovery);
    expect(replica().state).toBe(recovery.gameState);
    const incoming = setPresence(recovery, false);
    incoming.gameState.boardState.turnRecovery = null;
    deliver(incoming);
    expectPresence(false);
    expect(replica().state.boardState.turnRecovery).toBe(recovery.gameState.boardState.turnRecovery);
    deliver(setPresence(room, true));
    expectPresence(false);
    expect(replica().state).toBe(recovery.gameState);
  });

  it.each(['movement', 'card'] as const)('keeps an active %s timeline intact through equal-version flips and duplicates', async (kind) => {
    vi.useFakeTimers();
    const accepted = vi.spyOn(PresentationController.prototype, 'acceptRoomSnapshot');
    const room = makeRoom(130);
    mountPlayer(room);
    const controller = accepted.mock.contexts[0] as PresentationController;
    const next = cloneRoom(room, 131);
    if (kind === 'movement') {
      next.gameState.players[PLAYER].currentTile = 3;
      next.gameState.boardState.rollSequence = 1;
      next.gameState.boardState.diceValue = { dice1: 1, dice2: 2 };
    } else next.gameState.turnInfo.pendingCardInteraction = roomWithHistory().gameState.turnInfo.pendingCardInteraction;
    deliver(next);
    if (kind === 'movement') {
      // Advance only to the next scheduled event until the real first-hop signal is published.
      await act(async () => {
        for (let boundary = 0; boundary < 100 && !controller.store.getSnapshot().characterMovements.some(event => event.phase === 'START'); boundary += 1) {
          await vi.advanceTimersToNextTimerAsync();
        }
      });
    }
    expect(controller.queue.getStatus()).toBe('playing');
    const active = controller.store.getSnapshot();
    if (kind === 'movement') {
      expect(active.characterMovements.some(event => event.phase === 'START')).toBe(true);
      expect(active.settledPositions[PLAYER]).toBe(0);
    } else expect(active.cardPresentation?.operationId).toBe('settled-card');
    const reset = vi.spyOn(controller.queue, 'reset');
    const skip = vi.spyOn(controller.queue, 'skipAll');
    const queued = vi.spyOn(controller.queue, 'enqueueMany');
    accepted.mockClear();
    const emissions = socketHarness.emissions.length;
    for (const connected of [false, false, true]) {
      deliver(setPresence(next, connected));
      expectPresence(connected);
      expect(controller.store.getSnapshot()).toBe(active);
      expect(controller.queue.getStatus()).toBe('playing');
    }
    expect(reset).not.toHaveBeenCalled();
    expect(skip).not.toHaveBeenCalled();
    expect(queued).not.toHaveBeenCalled();
    expect(accepted).not.toHaveBeenCalled();
    expect(socketHarness.emissions).toHaveLength(emissions);
    await act(async () => {
      // Card countdowns may remain mounted after the queue settles, so stop at the queue's actual idle barrier.
      for (let boundary = 0; boundary < 100 && controller.queue.getStatus() !== 'idle'; boundary += 1) {
        await vi.advanceTimersToNextTimerAsync();
      }
    });
    expect(controller.queue.getStatus()).toBe('idle');
    expect(controller.store.getSnapshot().presentationResetEpoch).toBe(active.presentationResetEpoch);
    if (kind === 'movement') {
      expect(controller.store.getSnapshot().settledPositions[PLAYER]).toBe(3);
      expect(controller.store.getSnapshot().characterMovements.filter(event => event.phase === 'START').map(event => event.toTileId)).toEqual([1, 2, 3]);
    } else expect(controller.store.getSnapshot().cardPresentation?.operationId).toBe('settled-card');
  });
});

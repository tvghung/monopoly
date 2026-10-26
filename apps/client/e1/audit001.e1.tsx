import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps, ReactNode } from 'react';
import type { PrivatePlayerState, PublicRoomState } from '@monopoly/shared';
import { SOCKET_PROTOCOL_VERSION } from '@monopoly/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StateContextValue } from '../src/types';

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
const observation = vi.hoisted(() => ({ current: null as StateContextValue | null }));
vi.mock('socket.io-client', () => ({ io: () => socketHarness.socket }));

// Keep the actual scene boundary and all actual Lobby/Board/HUD consumers. The added leaf only observes App's public context;
// no copy of applyRoom, version ordering, projection, presentation derivation or UI behavior lives in this test.
vi.mock('../src/components/sceneLayer/SceneLayer', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/components/sceneLayer/SceneLayer')>();
  const { createElement, useContext } = await import('react');
  const { default: stateContext } = await import('../src/internal');
  function ReplicaProbe() { observation.current = useContext(stateContext); return null; }
  return {
    ...original,
    default: (props: ComponentProps<typeof original.default>) => createElement(
      original.default,
      props,
      createElement(ReplicaProbe),
      props.children as ReactNode,
    ),
  };
});

import App from '../src/App';
import { ToastProvider } from '../src/components/Toast';
import { PLAYER_SESSION_STORAGE_KEY } from '../src/playerSessionStorage';
import { PresentationController } from '../src/game/presentation/PresentationController';
import { AnimationQueue } from '../src/game/presentation/queue/AnimationQueue';
import { cloneRoom, makeRoom } from '../src/game/presentation/testFixtures';

const PLAYER = 'player-a';
const OTHER = 'player-b';
const TOKEN = 'E'.repeat(43);
const presenceCase = 'applies equal-version presence';

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
  fireEvent.change(screen.getByLabelText('Tên của bạn'), { target: { value: 'E1 Viewer' } });
  fireEvent.change(screen.getByLabelText('Mã phòng'), { target: { value: room.roomCode } });
  fireEvent.click(screen.getByRole('button', { name: 'Vào phòng' }));
  act(() => lastAck('join room')({
    ok: true, protocolVersion: SOCKET_PROTOCOL_VERSION, revision: room.version,
    data: { kind: 'SPECTATOR', role: 'SPECTATOR', playerId: null, room },
  }));
  expect(screen.getByText(/Chế độ Khán Giả/u)).toBeTruthy();
  return view;
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

// Both E1 modes enforce correctness after E1-FIX-001; obsolete stale-UI characterization is retired.
describe('AUDIT-001 mounted App presence and version ordering', () => {
  beforeEach(() => {
    socketHarness.reset();
    observation.current = null;
    window.localStorage.clear();
    window.history.replaceState({}, '', '/');
  });
  afterEach(async () => {
    try {
      cleanup();
      await Promise.resolve(); // PresentationController.release disposes on its documented microtask barrier.
      expect(socketHarness.listenerCount('update')).toBe(0);
      expect(socketHarness.listenerCount('private player state')).toBe(0);
    } finally {
      vi.restoreAllMocks();
      window.localStorage.clear();
      window.history.replaceState({}, '', '/');
    }
  });

  it('001-A lobby disconnect — ' + presenceCase, () => {
    const room = makeRoom(10);
    room.status = 'LOBBY';
    room.gameState.boardState.gameStarted = false;
    room.gameState.boardState.currentPlayer = { id: '', hasMoved: false };
    mountPlayer(room);
    expect(room.players.every(player => player.kind === 'HUMAN' && player.connected)).toBe(true);
    expectPresence(true);
    const emissions = socketHarness.emissions.length;
    const disconnected = setPresence(room, false);
    expect(disconnected.version).toBe(room.version);
    expect(disconnected.gameState).toEqual(room.gameState);
    deliver(disconnected);
    expect(replica().state).toEqual(room.gameState);
    expect(socketHarness.emissions).toHaveLength(emissions);
    expectPresence(false);
  });

  it('001-B non-current human disconnect — ' + presenceCase, () => {
    const room = makeRoom(11);
    expect(room.gameState.boardState.currentPlayer.id).not.toBe(OTHER);
    mountPlayer(room);
    const emissions = socketHarness.emissions.length;
    const disconnected = setPresence(room, false);
    expect(disconnected.version).toBe(room.version);
    expect(disconnected.gameState).toEqual(room.gameState);
    deliver(disconnected);
    expect(replica().state).toEqual(room.gameState);
    expect(socketHarness.emissions).toHaveLength(emissions);
    expectPresence(false);
  });

  it('001-C invariant: ordinary reconnect with a higher aggregate version repairs presence', () => {
    const offline = setPresence(makeRoom(12), false);
    mountPlayer(offline);
    expectPresence(false);
    act(() => socketHarness.socket.disconnect());
    act(() => socketHarness.socket.connect());
    const repaired = setPresence(offline, true, 13);
    acknowledgePlayer(repaired);
    expectPresence(true);
    expect(replica().state).toEqual(repaired.gameState);
    expect(replica().role).toBe('PLAYER');
    expect(replica().playerId).toBe(PLAYER);
    expect(socketHarness.emissions.some(emission => emission.event === 'leave room')).toBe(false);
  });

  it('001-D invariant: a lower-version snapshot cannot overwrite money, turn, position or newer presence', () => {
    const current = setPresence(makeRoom(15), false);
    mountPlayer(current);
    const stale = setPresence(current, true, 14);
    stale.gameState.players[PLAYER].accountBalance = 1;
    stale.gameState.players[PLAYER].currentTile = 39;
    stale.gameState.boardState.currentPlayer.id = OTHER;
    stale.gameState.boardState.turnNumber = 0;
    const emissions = socketHarness.emissions.length;
    deliver(stale);
    expectPresence(false);
    expect(replica().state).toEqual(current.gameState);
    expect(socketHarness.emissions).toHaveLength(emissions);
  });

  it('001-E presence-only delivery keeps settled dice, movement, payment and card presentation — ' + presenceCase, () => {
    const accepted = vi.spyOn(PresentationController.prototype, 'acceptRoomSnapshot');
    const queued = vi.spyOn(AnimationQueue.prototype, 'enqueueMany');
    const reset = vi.spyOn(AnimationQueue.prototype, 'reset');
    const room = roomWithHistory();
    mountPlayer(room);
    const controller = accepted.mock.contexts[0] as PresentationController;
    const presentation = controller.store.getSnapshot();
    expect(presentation.displayRollSequence).toBe(7);
    expect(presentation.displayPositions[PLAYER]).toBe(7);
    expect(presentation.displayBalances[PLAYER]).toBe(1475);
    expect(presentation.cardPresentation?.operationId).toBe('settled-card');
    accepted.mockClear(); queued.mockClear(); reset.mockClear();
    const emissions = socketHarness.emissions.length;
    deliver(setPresence(room, false));
    expect(controller.store.getSnapshot()).toEqual(presentation);
    expect(queued.mock.calls.flatMap(([events]) => events)).toEqual([]);
    expect(reset).not.toHaveBeenCalled();
    expect(socketHarness.emissions).toHaveLength(emissions);
    expectPresence(false);

    // Positive acceptance control: the real controller sees a newer presence-only snapshot and still enqueues no effects.
    deliver(setPresence(room, false, 21));
    expectPresence(false);
    expect(accepted).toHaveBeenCalledWith(expect.objectContaining({ version: 21 }), 'LIVE_UPDATE');
    expect(queued.mock.calls.flatMap(([events]) => events)).toEqual([]);
    expect(reset).not.toHaveBeenCalled();
    expect(controller.store.getSnapshot()).toEqual(presentation);
  });

  it('001-E control: the same mounted path does enqueue a fresh roll, walk, payment and card effect', () => {
    const accepted = vi.spyOn(PresentationController.prototype, 'acceptRoomSnapshot');
    const queued = vi.spyOn(AnimationQueue.prototype, 'enqueueMany');
    const room = makeRoom(30);
    mountPlayer(room);
    const controller = accepted.mock.contexts[0] as PresentationController;
    controller.queue.pause(); // Keep this control deterministic; cleanup aborts the paused queue.
    queued.mockClear();
    const next = cloneRoom(room, 31);
    next.gameState.boardState.rollSequence = 1;
    next.gameState.boardState.diceValue = { dice1: 3, dice2: 4 };
    next.gameState.players[PLAYER].currentTile = 7;
    next.gameState.players[PLAYER].accountBalance = 1475;
    next.gameState.boardState.gameplayEvents = roomWithHistory().gameState.boardState.gameplayEvents;
    next.gameState.turnInfo.pendingCardInteraction = roomWithHistory().gameState.turnInfo.pendingCardInteraction;
    deliver(next);
    expect(queued.mock.calls.flatMap(([events]) => events).map(event => event.type)).toEqual(expect.arrayContaining([
      'ROLL_DICE', 'MOVE_CHARACTER', 'MONEY_TRANSFER', 'CARD_INTERACTION_CHANGED',
    ]));
  });

  it('001-F spectator receives presence only and ignores private-player delivery — ' + presenceCase, () => {
    const room = makeRoom(40);
    mountSpectator(room);
    const queued = vi.spyOn(AnimationQueue.prototype, 'enqueueMany');
    const privateState: PrivatePlayerState = {
      playerId: PLAYER, heldJailFreeCardIds: ['chance-jail-free'],
      gameplayEvents: { sequence: 1, events: [{
        eventId: 'private-only-payment', sequence: 1, type: 'MONEY_TRANSFER',
        source: { kind: 'BANK' }, destination: { kind: 'PLAYER', playerId: PLAYER }, amount: 999, reason: 'CARD',
      }] },
    };
    act(() => socketHarness.trigger('private player state', privateState));
    expect(replica().role).toBe('SPECTATOR');
    expect(replica().playerId).toBeNull();
    expect(replica().canMutate).toBe(false);
    expect(replica().privatePlayerState).toBeNull();
    expect(replica().privateOffers).toEqual([]);
    expect(replica().state).toEqual(room.gameState);
    expect(window.localStorage.getItem(PLAYER_SESSION_STORAGE_KEY)).toBeNull();
    expect(document.body.textContent).not.toContain('private-only-payment');
    expect(queued.mock.calls.flatMap(([events]) => events)).toEqual([]);
    const emissions = socketHarness.emissions.length;
    deliver(setPresence(room, false));
    expect(replica().privatePlayerState).toBeNull();
    expect(replica().privateOffers).toEqual([]);
    expect(replica().state).toEqual(room.gameState);
    expect(socketHarness.emissions).toHaveLength(emissions);
    expectPresence(false);
    deliver(setPresence(room, false, 41));
    expectPresence(false);
    expect(replica().privatePlayerState).toBeNull();
    expect(replica().privateOffers).toEqual([]);
  });
});

import {
  act, cleanup, fireEvent, render, screen,
} from '@testing-library/react';
import { SOCKET_PROTOCOL_VERSION } from '@monopoly/shared';
import {
  afterEach, describe, expect, it, vi,
} from 'vitest';
import stateContext from '../../../internal';
import type { SocketFunctions, StateContextValue } from '../../../types';
import { presentationContext } from '../../presentation/PresentationProvider';
import type { AnimationQueue } from '../../presentation/queue/AnimationQueue';
import { PresentationStore } from '../../presentation/store/presentationStore';
import type { BoardEventSignal } from '../../presentation/store/types';
import { cloneRoom, makeRoom } from '../../presentation/testFixtures';
import { presentationTiming } from '../../presentation/timings';
import BoardEventStage from './BoardEventStage';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function renderStage(options: {
  stage: 'AWAITING_DRAW' | 'REVEALED';
  viewerPlayerId?: string | null;
  role?: StateContextValue['role'];
  boardEvent?: BoardEventSignal;
  presentationStage?: 'DRAWING' | 'REVEALING';
}) {
  const room = cloneRoom(makeRoom());
  room.gameState.players['player-a'].currentTile = 7;
  room.gameState.turnInfo.pendingCardInteraction = {
    operationId: '00000000-0000-4000-8000-000000000700',
    playerId: 'player-a',
    turnNumber: 1,
    deck: 'chance',
    sourceTile: 7,
    stage: options.stage,
    ...(options.stage === 'REVEALED' ? { revealedCardId: 'chance-dividend' as const } : {}),
    continuation: { playerId: 'player-a', turnNumber: 1 },
    deadlineAt: '2030-01-01T00:00:30.000Z',
  };
  const store = new PresentationStore();
  store.resetFromSnapshot(room);
  if (options.presentationStage) store.setCardPresentation({
    operationId: '00000000-0000-4000-8000-000000000700',
    playerId: 'player-a',
    deck: 'chance',
    sourceTile: 7,
    stage: options.presentationStage,
    ...(options.presentationStage === 'REVEALING'
      ? { revealedCardId: 'chance-dividend' as const }
      : {}),
    durationMs: 720,
  });
  if (options.boardEvent) store.showBoardEvent(options.boardEvent);
  const drawCard = vi.fn(() => Promise.resolve({
    ok: true as const,
    protocolVersion: SOCKET_PROTOCOL_VERSION,
    revision: 2,
  }));
  const dismissCard = vi.fn(() => Promise.resolve({
    ok: true as const,
    protocolVersion: SOCKET_PROTOCOL_VERSION,
    revision: 3,
  }));
  const socketFunctions = { drawCard, dismissCard } as unknown as SocketFunctions;
  const onCardDraw = vi.fn();
  const context: StateContextValue = {
    state: room.gameState,
    socketFunctions,
    playerId: options.viewerPlayerId === undefined ? 'player-a' : options.viewerPlayerId,
    role: options.role ?? 'PLAYER',
    connected: true,
    canMutate: options.role !== 'SPECTATOR',
    privatePlayerState: null,
    privateOffers: [],
    roomPlayers: room.players,
  };
  const view = render(
    <stateContext.Provider value={context}>
      <presentationContext.Provider value={{
        state: store.getSnapshot(),
        queue: null as unknown as AnimationQueue,
      }}>
        <BoardEventStage
          cardDrawError=""
          cardDrawPending={false}
          onCardDraw={onCardDraw}
        />
      </presentationContext.Provider>
    </stateContext.Provider>,
  );
  return {
    ...view, dismissCard, drawCard, onCardDraw,
  };
}

describe('BoardEventStage card authority', () => {
  it('names both bank and player endpoints for money transfers', () => {
    const baseEvent = {
      id: 'money-bank-player',
      kind: 'MONEY_TRANSFER' as const,
      playerIds: ['player-a'],
      tileIds: [],
      amount: 200,
      reason: 'OTHER' as const,
      durationMs: 1_000,
    };
    const view = renderStage({
      stage: 'AWAITING_DRAW',
      boardEvent: {
        ...baseEvent,
        source: { kind: 'BANK' },
        destination: { kind: 'PLAYER', playerId: 'player-a' },
      },
    });
    expect(screen.getByText('Ngân hàng → An')).toBeTruthy();
    view.unmount();

    renderStage({
      stage: 'AWAITING_DRAW',
      boardEvent: {
        ...baseEvent,
        id: 'money-player-bank',
        source: { kind: 'PLAYER', playerId: 'player-a' },
        destination: { kind: 'BANK' },
      },
    });
    expect(screen.getByText('An → Ngân hàng')).toBeTruthy();
  });

  it('preserves BANK as a named property-transfer endpoint', () => {
    renderStage({
      stage: 'AWAITING_DRAW',
      boardEvent: {
        id: 'property-bank-transfer',
        kind: 'PROPERTY_TRANSFER',
        playerIds: ['player-a'],
        tileIds: [1],
        source: { kind: 'PLAYER', playerId: 'player-a' },
        destination: { kind: 'BANK' },
        durationMs: 1_000,
      },
    });
    expect(screen.getByText('An → Ngân hàng')).toBeTruthy();
  });

  it('does not render a global PASS GO banner', () => {
    const { container } = renderStage({
      stage: 'AWAITING_DRAW',
      boardEvent: {
        id: 'pass-go',
        kind: 'PASS_GO',
        playerIds: ['player-a'],
        tileIds: [0],
        amount: 200,
        durationMs: 1_000,
      },
    });
    expect(container.querySelector('.board-event-stage')).toBeNull();
  });

  it('gives only the active player the settled physical-card command', () => {
    const active = renderStage({ stage: 'AWAITING_DRAW' });
    fireEvent.click(screen.getByRole('button', { name: 'Nhấn vào thẻ để xem' }));
    expect(active.onCardDraw).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000700');
    expect(active.drawCard).not.toHaveBeenCalled();
    active.unmount();

    renderStage({ stage: 'AWAITING_DRAW', viewerPlayerId: 'player-b' });
    expect(screen.queryByRole('button', { name: 'Nhấn vào thẻ để xem' })).toBeNull();
    expect(screen.getByText(/Đang chờ An xem thẻ/)).toBeTruthy();
  });

  it('shows no instruction before the physical flight has settled', () => {
    renderStage({ stage: 'AWAITING_DRAW', presentationStage: 'DRAWING' });
    expect(screen.queryByText('Nhấn vào thẻ để xem')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('blocks close and Escape for the reveal dwell, then permits the active player', async () => {
    vi.useFakeTimers();
    const { dismissCard } = renderStage({ stage: 'REVEALED' });
    const close = screen.getByRole<HTMLButtonElement>('button', { name: 'Đóng thẻ' });
    expect(close.disabled).toBe(true);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(dismissCard).not.toHaveBeenCalled();

    await act(async () => vi.advanceTimersByTimeAsync(presentationTiming.cardRevealLock));
    expect(close.disabled).toBe(false);
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(dismissCard).toHaveBeenCalledTimes(1);
  });

  it('never lets another player or a spectator dismiss the revealed card', async () => {
    vi.useFakeTimers();
    const other = renderStage({ stage: 'REVEALED', viewerPlayerId: 'player-b' });
    await act(async () => vi.advanceTimersByTimeAsync(presentationTiming.cardRevealLock));
    fireEvent.keyDown(window, { key: 'Escape' });
    const backdrop = other.container.querySelector('.card-focus-overlay');
    if (backdrop) fireEvent.mouseDown(backdrop);
    expect(other.dismissCard).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Đóng thẻ' })).toBeNull();
    other.unmount();

    const spectator = renderStage({ stage: 'REVEALED', viewerPlayerId: null, role: 'SPECTATOR' });
    await act(async () => vi.advanceTimersByTimeAsync(presentationTiming.cardRevealLock));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(spectator.dismissCard).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Đóng thẻ' })).toBeNull();
  });
});

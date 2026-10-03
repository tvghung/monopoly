import { act, cleanup, render, screen } from '@testing-library/react';
import type { PublicGameState, PublicRoomState } from '@monopoly/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { presentationStoreContext } from '../../game/presentation/PresentationProvider';
import type { AnimationQueue } from '../../game/presentation/queue/AnimationQueue';
import { PresentationStore } from '../../game/presentation/store/presentationStore';
import { makeRoom } from '../../game/presentation/testFixtures';
import useDebtPresentationHold, { DEBT_HOLD_FALLBACK_MS, isDebtPresentationSettled } from './useDebtPresentationHold';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const FIRST_OPERATION = '00000000-0000-4000-8000-000000000001';
const SECOND_OPERATION = '00000000-0000-4000-8000-000000000011';

/** A room where An landed on the tile `tile`, paid everything he had and still owes `owed`; the creditor is Bình or the Bank. */
function debtRoom({
  tile = 3, debtorCash = 0, creditorCash = 500, creditor = 'player-b', operationId = FIRST_OPERATION, withDebt = true,
}: {
  tile?: number;
  debtorCash?: number;
  creditorCash?: number;
  creditor?: 'player-b' | 'BANK';
  operationId?: string;
  withDebt?: boolean;
} = {}): PublicRoomState {
  const room = makeRoom();
  const game = room.gameState;
  game.players['player-a'].currentTile = tile;
  game.players['player-a'].accountBalance = debtorCash;
  game.players['player-b'].accountBalance = creditorCash;
  game.boardState.paymentShortfall = withDebt
    ? {
      debtorPlayerId: 'player-a',
      creditor: creditor === 'BANK' ? 'BANK' : 'PLAYER',
      ...(creditor === 'BANK' ? {} : { creditorPlayerId: creditor }),
      amount: 300,
      remainingAmount: 200,
      source: { kind: 'RENT', tileID: tile },
      actionDeadlineAt: new Date(Date.now() + 60_000).toISOString(),
      remainingClaimCount: 1,
      paymentOperationId: operationId,
      claimId: '00000000-0000-4000-8000-000000000002',
      sellableProperties: [],
    }
    : null;
  return room;
}

function Probe({ state }: { state: PublicGameState }) {
  const hold = useDebtPresentationHold(state.boardState.paymentShortfall ?? null, state);
  return <output data-testid="hold" data-hold={String(hold)} />;
}

function Harness({ state, store }: { state: PublicGameState; store: PresentationStore }) {
  return (
    <presentationStoreContext.Provider value={{ store, queue: null as unknown as AnimationQueue }}>
      <Probe state={state} />
    </presentationStoreContext.Provider>
  );
}

const held = () => screen.getByTestId('hold').getAttribute('data-hold') === 'true';

/** A store whose display already shows `room` (what a snapshot leaves behind), with an idle queue. */
function storeShowing(room: PublicRoomState): PresentationStore {
  const store = new PresentationStore();
  store.resetFromSnapshot(room);
  return store;
}

describe('isDebtPresentationSettled', () => {
  const slice = (room: PublicRoomState, status: 'idle' | 'playing' = 'idle') => {
    const store = storeShowing(room);
    const { settledPositions, displayBalances } = store.getSnapshot();
    return { status, settledPositions, displayBalances };
  };

  it('is settled when the queue is idle and the display shows what the room holds', () => {
    const room = debtRoom();
    expect(isDebtPresentationSettled(room.gameState.boardState.paymentShortfall!, room.gameState, slice(room))).toBe(true);
  });

  it('waits while the queue is busy, however equal the numbers are', () => {
    const room = debtRoom();
    expect(isDebtPresentationSettled(room.gameState.boardState.paymentShortfall!, room.gameState, slice(room, 'playing'))).toBe(false);
  });

  it('waits for the debtor token to reach the tile the room says it stands on', () => {
    const arrived = debtRoom({ tile: 3 });
    const before = debtRoom({ tile: 1, withDebt: false });
    expect(isDebtPresentationSettled(arrived.gameState.boardState.paymentShortfall!, arrived.gameState, slice(before))).toBe(false);
  });

  it('waits for the debtor and for a player creditor to show the cash the room holds, but not for the Bank', () => {
    const owed = debtRoom({ debtorCash: 0, creditorCash: 650 });
    const debtorStillRich = debtRoom({ debtorCash: 150, creditorCash: 650, withDebt: false });
    const creditorStillPoor = debtRoom({ debtorCash: 0, creditorCash: 500, withDebt: false });
    const claim = owed.gameState.boardState.paymentShortfall!;
    expect(isDebtPresentationSettled(claim, owed.gameState, slice(debtorStillRich))).toBe(false);
    expect(isDebtPresentationSettled(claim, owed.gameState, slice(creditorStillPoor))).toBe(false);

    const toBank = debtRoom({ creditor: 'BANK', creditorCash: 800 });
    const bankClaim = toBank.gameState.boardState.paymentShortfall!;
    // Bình is not part of a debt to the Bank: his figure is nobody's business here.
    expect(isDebtPresentationSettled(bankClaim, toBank.gameState, slice(debtRoom({ creditor: 'BANK', creditorCash: 500, withDebt: false })))).toBe(true);
  });
});

describe('useDebtPresentationHold', () => {
  it('holds the debt while the queue plays the hop and the coins, then releases it when the queue is idle', () => {
    const before = debtRoom({ tile: 1, debtorCash: 100, creditorCash: 500, withDebt: false });
    const store = storeShowing(before);
    store.setStatus('playing');
    const arrived = debtRoom({ tile: 3, debtorCash: 0, creditorCash: 600 });
    const view = render(<Harness state={before.gameState} store={store} />);
    expect(held()).toBe(false);

    view.rerender(<Harness state={arrived.gameState} store={store} />);
    expect(held()).toBe(true);

    // The queue catches up: the display reaches the room state and the status goes idle.
    act(() => {
      store.resetFromSnapshot(arrived);
      store.setStatus('idle');
    });
    expect(held()).toBe(false);
  });

  it('holds in the very render where the room state arrives, before the queue has started, when the display lags', () => {
    const before = debtRoom({ tile: 1, debtorCash: 100, withDebt: false });
    const store = storeShowing(before);
    const view = render(<Harness state={before.gameState} store={store} />);
    view.rerender(<Harness state={debtRoom({ tile: 3, debtorCash: 0 }).gameState} store={store} />);
    expect(held()).toBe(true);
  });

  it('shows a debt at once when there was nothing to play (a reconnect or a debt that is already settled)', () => {
    const room = debtRoom();
    render(<Harness state={room.gameState} store={storeShowing(room)} />);
    expect(held()).toBe(false);
  });

  it('keeps showing the debt once released, even when a sale starts the queue again', () => {
    const room = debtRoom();
    const store = storeShowing(room);
    render(<Harness state={room.gameState} store={store} />);
    expect(held()).toBe(false);
    act(() => { store.setStatus('playing'); });
    expect(held()).toBe(false);
  });

  it('holds the next debt again, and never holds when there is no debt', () => {
    const first = debtRoom();
    const store = storeShowing(first);
    const view = render(<Harness state={first.gameState} store={store} />);
    expect(held()).toBe(false);

    view.rerender(<Harness state={debtRoom({ withDebt: false }).gameState} store={store} />);
    expect(held()).toBe(false);

    act(() => { store.setStatus('playing'); });
    view.rerender(<Harness state={debtRoom({ operationId: SECOND_OPERATION }).gameState} store={store} />);
    expect(held()).toBe(true);
  });

  it('shows the debt after the safety timeout when the queue never reports idle', () => {
    vi.useFakeTimers();
    const store = new PresentationStore();
    store.setStatus('playing');
    render(<Harness state={debtRoom().gameState} store={store} />);
    expect(held()).toBe(true);

    act(() => { vi.advanceTimersByTime(DEBT_HOLD_FALLBACK_MS - 1); });
    expect(held()).toBe(true);
    act(() => { vi.advanceTimersByTime(1); });
    expect(held()).toBe(false);
  });

  it('never holds without a presentation store (an isolated render)', () => {
    const room = debtRoom();
    function Bare() {
      const hold = useDebtPresentationHold(room.gameState.boardState.paymentShortfall ?? null, room.gameState);
      return <output data-testid="hold" data-hold={String(hold)} />;
    }
    render(<Bare />);
    expect(held()).toBe(false);
  });
});

import {
  act, cleanup, fireEvent, render, screen, waitFor, within,
} from '@testing-library/react';
import type { Ack, PublicGameState } from '@monopoly/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import stateContext from '../../internal';
import tradePromptContext from '../../tradePromptContext';
import type { SocketFunctions, StateContextValue } from '../../types';
import { resetModalPeekForTests } from '../../design-system/components/Modal/modalPeek';
import { makeRoom } from '../../game/presentation/testFixtures';
import PropertyInspectionModal from '../../game/ui/property/PropertyInspectionModal';
import BuyPrompt from './BuyPrompt';
import DebtPanel from './DebtPanel';
import DevelopmentPrompt from './DevelopmentPrompt';

afterEach(() => {
  cleanup();
  resetModalPeekForTests();
  vi.useRealTimers();
});

function makeSocketFunctions(overrides: Partial<SocketFunctions> = {}): SocketFunctions {
  return {
    rollDice: vi.fn(),
    buyProperty: vi.fn(),
    doNotBuy: vi.fn(),
    resolveDevelopment: vi.fn(),
    sendChat: vi.fn(),
    makeOffer: vi.fn(),
    acceptOffer: vi.fn(),
    declineOffer: vi.fn(),
    sellHouse: vi.fn(),
    payBail: vi.fn(),
    useJailCard: vi.fn(),
    sellPropertyToBank: vi.fn(),
    ...overrides,
  };
}

function contextFor(state: PublicGameState, socketFunctions: SocketFunctions): StateContextValue {
  return {
    state,
    socketFunctions,
    playerId: 'player-a',
    role: 'PLAYER',
    connected: true,
    canMutate: true,
    privatePlayerState: null,
    privateOffers: [],
  };
}

function purchaseState(operationId = 'purchase-1'): PublicGameState {
  const room = makeRoom();
  room.gameState.turnInfo.pendingLandingDecision = {
    kind: 'PURCHASE', operationId, playerId: 'player-a', tileID: 1, price: 60,
  };
  return room.gameState;
}

function developmentState(): PublicGameState {
  const room = makeRoom();
  room.gameState.turnInfo.pendingLandingDecision = {
    kind: 'DEVELOP_HOUSES', operationId: 'development-1', playerId: 'player-a', tileID: 1, unitCost: 50, maxQuantity: 2,
  };
  return room.gameState;
}

function debtState(): PublicGameState {
  const room = makeRoom();
  room.gameState.players['player-a'].accountBalance = 100;
  room.gameState.boardState.paymentShortfall = {
    rescue: null,
    debtorPlayerId: 'player-a',
    creditor: 'BANK',
    amount: 300,
    remainingAmount: 200,
    source: { kind: 'RENT', tileID: 3 },
    actionDeadlineAt: new Date(Date.now() + 60_000).toISOString(),
    remainingClaimCount: 1,
    paymentOperationId: '00000000-0000-4000-8000-000000000001',
    claimId: '00000000-0000-4000-8000-000000000002',
    sellableProperties: [{ tileID: 1, grossPrice: 112, houses: 2 }],
  };
  return room.gameState;
}

const eye = () => screen.getByRole('button', { name: 'Xem bàn cờ' });
const restoreKey = () => screen.queryByRole('button', { name: 'Hiện quyết định' });

describe('hiding a purchase decision', () => {
  it('sends nothing while hidden or shown, and the decision still waits for an explicit answer', () => {
    const socketFunctions = makeSocketFunctions();
    render(
      <stateContext.Provider value={contextFor(purchaseState(), socketFunctions)}>
        <BuyPrompt tokenArrived />
      </stateContext.Provider>,
    );

    fireEvent.click(eye());
    expect(screen.queryByRole('button', { name: 'Mua tài sản' })).toBeNull();
    fireEvent.click(restoreKey() as HTMLElement);

    expect(socketFunctions.buyProperty).not.toHaveBeenCalled();
    expect(socketFunctions.doNotBuy).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Mua tài sản' }));
    expect(socketFunctions.buyProperty).toHaveBeenCalledExactlyOnceWith('purchase-1');
  });

  it('keeps a request that is in flight, so hiding and showing cannot send it twice', () => {
    const buyProperty = vi.fn(() => new Promise<Ack>(() => {}));
    const socketFunctions = makeSocketFunctions({ buyProperty });
    render(
      <stateContext.Provider value={contextFor(purchaseState(), socketFunctions)}>
        <BuyPrompt tokenArrived />
      </stateContext.Provider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Mua tài sản' }));

    fireEvent.click(eye());
    fireEvent.click(restoreKey() as HTMLElement);

    const button = screen.getByRole('button', { name: /Mua tài sản/u });
    expect(button.hasAttribute('disabled')).toBe(true);
    fireEvent.click(button);
    expect(buyProperty).toHaveBeenCalledTimes(1);
  });

  it('follows the authoritative state while hidden: the decision is gone when the server settles it, and no key is left', () => {
    const socketFunctions = makeSocketFunctions();
    const state = purchaseState();
    const view = render(
      <stateContext.Provider value={contextFor(state, socketFunctions)}>
        <BuyPrompt tokenArrived />
      </stateContext.Provider>,
    );
    fireEvent.click(eye());
    expect(restoreKey()).toBeTruthy();

    const settled = makeRoom().gameState;
    view.rerender(
      <stateContext.Provider value={contextFor(settled, socketFunctions)}>
        <BuyPrompt tokenArrived />
      </stateContext.Provider>,
    );

    expect(restoreKey()).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows a new purchase decision at once instead of leaving it hidden', async () => {
    const socketFunctions = makeSocketFunctions();
    const view = render(
      <stateContext.Provider value={contextFor(purchaseState('purchase-1'), socketFunctions)}>
        <BuyPrompt tokenArrived />
      </stateContext.Provider>,
    );
    fireEvent.click(eye());

    view.rerender(
      <stateContext.Provider value={contextFor(purchaseState('purchase-2'), socketFunctions)}>
        <BuyPrompt tokenArrived />
      </stateContext.Provider>,
    );

    await waitFor(() => expect(restoreKey()).toBeNull());
    expect(screen.getByRole('button', { name: 'Mua tài sản' })).toBeTruthy();
  });

  it('can be hidden and shown for a development choice too, without resolving it', () => {
    const socketFunctions = makeSocketFunctions();
    render(
      <stateContext.Provider value={contextFor(developmentState(), socketFunctions)}>
        <DevelopmentPrompt tokenArrived />
      </stateContext.Provider>,
    );

    fireEvent.click(eye());
    fireEvent.click(restoreKey() as HTMLElement);

    expect(socketFunctions.resolveDevelopment).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeTruthy();
  });
});

describe('hiding a debt decision', () => {
  it('keeps the clock running and shows the seconds left beside the restore key', () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    const socketFunctions = makeSocketFunctions();
    render(
      <stateContext.Provider value={contextFor(debtState(), socketFunctions)}>
        <DebtPanel />
      </stateContext.Provider>,
    );
    fireEvent.click(eye());
    const peekRow = () => screen.getByTestId('modal-peek-restore').textContent;
    expect(peekRow()).toContain('Còn 60 giây');

    act(() => { vi.advanceTimersByTime(3000); });
    expect(peekRow()).toContain('Còn 57 giây');

    fireEvent.click(restoreKey() as HTMLElement);
    expect(document.querySelector('.debt-panel__countdown')?.textContent).toBe('Còn 57 giây');
    expect(socketFunctions.sellPropertyToBank).not.toHaveBeenCalled();
  });

  it('keeps the chosen property and the typed price across hiding', () => {
    const socketFunctions = makeSocketFunctions();
    render(
      <stateContext.Provider value={contextFor(debtState(), socketFunctions)}>
        <DebtPanel />
      </stateContext.Provider>,
    );
    const before = screen.getAllByRole('button').filter(button => button.getAttribute('aria-pressed') !== null);
    fireEvent.click(eye());
    fireEvent.click(restoreKey() as HTMLElement);

    const after = screen.getAllByRole('button').filter(button => button.getAttribute('aria-pressed') !== null);
    expect(after.map(button => button.getAttribute('aria-pressed'))).toEqual(before.map(button => button.getAttribute('aria-pressed')));
    expect(socketFunctions.sellPropertyToBank).not.toHaveBeenCalled();
  });
});

describe('looking at the board while a decision is hidden', () => {
  function inspection(tileId = 1) {
    const room = makeRoom();
    room.gameState.boardState.ownedProps = { [tileId]: { id: 'player-a', color: 'red', houses: 2 } };
    room.gameState.turnInfo.pendingLandingDecision = {
      kind: 'PURCHASE', operationId: 'purchase-1', playerId: 'player-a', tileID: 3, price: 60,
    };
    const socketFunctions = makeSocketFunctions();
    const value = contextFor(room.gameState, socketFunctions);
    value.roomPlayers = room.players;
    return render(
      <stateContext.Provider value={value}>
        <tradePromptContext.Provider value={{ tradeTarget: null, openTradeForProperty: vi.fn(), closeTrade: vi.fn() }}>
          <BuyPrompt tokenArrived />
          <PropertyInspectionModal tileId={tileId} onClose={vi.fn()} />
        </tradePromptContext.Provider>
      </stateContext.Provider>,
    );
  }

  it('is read-only: the sale of a house is not offered until the decision is shown and answered', () => {
    inspection();
    // Both dialogs are open: the property card and the purchase decision under it.
    expect(screen.getByRole('button', { name: 'Bán Nhà' })).toBeTruthy();

    const [purchaseDialog] = screen.getAllByRole('dialog');
    fireEvent.click(within(purchaseDialog).getByRole('button', { name: 'Xem bàn cờ' }));

    expect(screen.queryByRole('button', { name: 'Bán Nhà' })).toBeNull();
    expect(screen.getByText(/Hãy hiện lại quyết định đang chờ/u)).toBeTruthy();

    // Showing the decision gives the board its actions back only once the decision is no longer hidden.
    fireEvent.click(restoreKey() as HTMLElement);
    expect(screen.getByRole('button', { name: 'Bán Nhà' })).toBeTruthy();
  });
});

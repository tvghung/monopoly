import {
  act, cleanup, fireEvent, render, screen, waitFor,
} from '@testing-library/react';
import type {
  Ack, ForcedSaleProposal, PublicGameState, PrivatePlayerState,
} from '@monopoly/shared';
import { SOCKET_PROTOCOL_VERSION } from '@monopoly/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import stateContext from '../../internal';
import type { SocketFunctions, StateContextValue } from '../../types';
import { makeRoom } from '../../game/presentation/testFixtures';
import DebtPanel from './DebtPanel';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const success: Ack = { ok: true, protocolVersion: SOCKET_PROTOCOL_VERSION };
const failure: Ack = {
  ok: false,
  protocolVersion: SOCKET_PROTOCOL_VERSION,
  error: { code: 'CONFLICT', message: 'The debt claim changed.', retryable: true },
};

function debtState(overrides: {
  remainingAmount?: number;
  actionDeadlineAt?: string;
  sellableProperties?: Array<{ tileID: number; grossPrice: number; houses: number }>;
} = {}): PublicGameState {
  const room = makeRoom();
  room.gameState.players['player-a'].accountBalance = 100;
  room.gameState.players['player-b'].accountBalance = 500;
  room.gameState.boardState.paymentShortfall = {
    debtorPlayerId: 'player-a',
    creditor: 'BANK',
    amount: 300,
    remainingAmount: overrides.remainingAmount ?? 200,
    source: { kind: 'RENT', tileID: 3 },
    actionDeadlineAt: overrides.actionDeadlineAt ?? new Date(Date.now() + 60_000).toISOString(),
    remainingClaimCount: 1,
    paymentOperationId: '00000000-0000-4000-8000-000000000001',
    claimId: '00000000-0000-4000-8000-000000000002',
    sellableProperties: overrides.sellableProperties ?? [{ tileID: 1, grossPrice: 112, houses: 2 }],
  };
  return room.gameState;
}

function proposal(): ForcedSaleProposal {
  return {
    proposalId: '00000000-0000-4000-8000-000000000003',
    paymentOperationId: '00000000-0000-4000-8000-000000000001',
    claimId: '00000000-0000-4000-8000-000000000002',
    sellerPlayerId: 'player-a',
    buyerPlayerId: 'player-b',
    tileID: 1,
    grossPrice: 112,
    expectedHouses: 2,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  };
}

function makeContext(
  state: PublicGameState,
  socketFunctions: Partial<SocketFunctions> = {},
  privateState: PrivatePlayerState | null = null,
): StateContextValue {
  return {
    state,
    playerId: 'player-a',
    role: 'PLAYER',
    connected: true,
    canMutate: true,
    privatePlayerState: privateState,
    privateOffers: [],
    socketFunctions: {
      rollDice: vi.fn(),
      buyProperty: vi.fn(),
      sendChat: vi.fn(),
      makeOffer: vi.fn(),
      acceptOffer: vi.fn(),
      declineOffer: vi.fn(),
      sellHouse: vi.fn(),
      payBail: vi.fn(),
      useJailCard: vi.fn(),
      ...socketFunctions,
    },
  };
}

function renderDebt(
  state: PublicGameState,
  socketFunctions: Partial<SocketFunctions> = {},
  privateState: PrivatePlayerState | null = null,
) {
  return render(
    <stateContext.Provider value={makeContext(state, socketFunctions, privateState)}>
      <DebtPanel />
    </stateContext.Provider>,
  );
}

describe('DebtPanel', () => {
  it('shows authoritative forced-sale values and sells to the Bank', () => {
    const sellPropertyToBank = vi.fn(() => Promise.resolve(success));
    renderDebt(debtState(), { sellPropertyToBank });

    expect(screen.getByText(/200\.000 ₫/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Bán cho Ngân hàng' }));
    expect(sellPropertyToBank).toHaveBeenCalledWith({
      paymentOperationId: '00000000-0000-4000-8000-000000000001',
      claimId: '00000000-0000-4000-8000-000000000002',
      tileID: 1,
    });
  });

  it('sends at most one bank-sale command while its ACK is pending', () => {
    const sellPropertyToBank = vi.fn(() => new Promise<Ack>(() => {}));
    renderDebt(debtState(), { sellPropertyToBank });

    const button = screen.getByRole('button', { name: 'Bán cho Ngân hàng' });
    fireEvent.click(button);
    fireEvent.click(button);

    expect(sellPropertyToBank).toHaveBeenCalledTimes(1);
    expect(button.hasAttribute('disabled')).toBe(true);
  });

  it('unlocks the next bank sale when the same claim projection advances', async () => {
    let resolveSale!: (response: Ack) => void;
    const sellPropertyToBank = vi.fn(() => new Promise<Ack>(resolve => { resolveSale = resolve; }));
    const initial = debtState();
    const view = renderDebt(initial, { sellPropertyToBank });

    fireEvent.click(screen.getByRole('button', { name: 'Bán cho Ngân hàng' }));
    act(() => { resolveSale(success); });
    expect(screen.getByRole('button', { name: 'Bán cho Ngân hàng' }).hasAttribute('disabled')).toBe(true);

    const advanced = debtState({
      remainingAmount: 88,
      actionDeadlineAt: new Date(Date.now() + 90_000).toISOString(),
      sellableProperties: [{ tileID: 2, grossPrice: 64, houses: 0 }],
    });
    view.rerender(
      <stateContext.Provider value={makeContext(advanced, { sellPropertyToBank })}>
        <DebtPanel />
      </stateContext.Provider>,
    );

    await waitFor(() => expect(screen.getByRole('button', { name: 'Bán cho Ngân hàng' }).hasAttribute('disabled')).toBe(false));
  });

  it('keeps debt actions blocked while the seller proposal is active', async () => {
    const proposeForcedSale = vi.fn(() => Promise.resolve(success));
    const initial = debtState();
    const view = renderDebt(initial, { proposeForcedSale });

    fireEvent.click(screen.getByRole('button', { name: 'Đề nghị Bình mua' }));
    await waitFor(() => expect(proposeForcedSale).toHaveBeenCalledTimes(1));

    view.rerender(
      <stateContext.Provider value={makeContext(initial, { proposeForcedSale }, {
        playerId: 'player-a',
        heldJailFreeCardIds: [],
        gameplayEvents: { sequence: 0, events: [] },
        forcedSaleProposal: proposal(),
      })}>
        <DebtPanel />
      </stateContext.Provider>,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Bán cho Ngân hàng' }).hasAttribute('disabled')).toBe(true);
      expect(screen.getByRole('button', { name: 'Đề nghị Bình mua' }).hasAttribute('disabled')).toBe(true);
    });
  });

  it('unlocks debt actions when the active proposal is cleared', async () => {
    const activePrivateState: PrivatePlayerState = {
      playerId: 'player-a',
      heldJailFreeCardIds: [],
      gameplayEvents: { sequence: 0, events: [] },
      forcedSaleProposal: proposal(),
    };
    const view = renderDebt(debtState(), {}, activePrivateState);
    expect(screen.getByRole('button', { name: 'Bán cho Ngân hàng' }).hasAttribute('disabled')).toBe(true);

    view.rerender(
      <stateContext.Provider value={makeContext(debtState(), {}, {
        playerId: 'player-a',
        heldJailFreeCardIds: [],
        gameplayEvents: { sequence: 0, events: [] },
        forcedSaleProposal: null,
      })}>
        <DebtPanel />
      </stateContext.Provider>,
    );

    await waitFor(() => expect(screen.getByRole('button', { name: 'Bán cho Ngân hàng' }).hasAttribute('disabled')).toBe(false));
  });

  it('unlocks after ACK failure and shows one localized inline error', async () => {
    const sellPropertyToBank = vi.fn(() => Promise.resolve(failure));
    renderDebt(debtState(), { sellPropertyToBank });

    const button = screen.getByRole('button', { name: 'Bán cho Ngân hàng' });
    fireEvent.click(button);

    await waitFor(() => expect(button.hasAttribute('disabled')).toBe(false));
    expect(screen.getAllByText('Không thể thực hiện hành động ở trạng thái hiện tại.')).toHaveLength(1);
  });
});

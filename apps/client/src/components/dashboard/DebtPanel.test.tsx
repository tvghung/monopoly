import {
  act, cleanup, fireEvent, render, screen, waitFor, within,
} from '@testing-library/react';
import type {
  Ack, ForcedSaleProposal, PublicGameState, PrivatePlayerState,
} from '@monopoly/shared';
import { SOCKET_PROTOCOL_VERSION } from '@monopoly/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import stateContext from '../../internal';
import { roomExitContext, type RoomExitContextValue } from '../../roomExitContext';
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
    fireEvent.click(screen.getByRole('button', { name: 'Bán Cà Mau cho Ngân hàng' }));
    expect(sellPropertyToBank).toHaveBeenCalledWith({
      paymentOperationId: '00000000-0000-4000-8000-000000000001',
      claimId: '00000000-0000-4000-8000-000000000002',
      tileID: 1,
    });
  });

  it('sends at most one bank-sale command while its ACK is pending', () => {
    const sellPropertyToBank = vi.fn(() => new Promise<Ack>(() => {}));
    renderDebt(debtState(), { sellPropertyToBank });

    const button = screen.getByRole('button', { name: 'Bán Cà Mau cho Ngân hàng' });
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

    fireEvent.click(screen.getByRole('button', { name: 'Bán Cà Mau cho Ngân hàng' }));
    act(() => { resolveSale(success); });
    expect(screen.getByRole('button', { name: 'Bán Cà Mau cho Ngân hàng' }).hasAttribute('disabled')).toBe(true);

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

    await waitFor(() => expect(screen.getByRole('button', { name: /cho Ngân hàng/ }).hasAttribute('disabled')).toBe(false));
  });

  it('keeps debt actions blocked while the seller proposal is active', async () => {
    const proposeForcedSale = vi.fn(() => Promise.resolve(success));
    const initial = debtState();
    const view = renderDebt(initial, { proposeForcedSale });

    fireEvent.click(screen.getByRole('button', { name: 'Đề nghị người chơi mua Cà Mau' }));
    fireEvent.click(screen.getByRole('radio', { name: /Bình/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Gửi đề nghị bán' }));
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

    await waitFor(() => expect(screen.queryByRole('alertdialog', { name: 'Cần thanh toán' })).toBeNull());
  });

  it('unlocks debt actions when the active proposal is cleared', async () => {
    const activePrivateState: PrivatePlayerState = {
      playerId: 'player-a',
      heldJailFreeCardIds: [],
      gameplayEvents: { sequence: 0, events: [] },
      forcedSaleProposal: proposal(),
    };
    const view = renderDebt(debtState(), {}, activePrivateState);
    expect(screen.queryByRole('alertdialog', { name: 'Cần thanh toán' })).toBeNull();

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

    await waitFor(() => expect(screen.getByRole('button', { name: 'Bán Cà Mau cho Ngân hàng' }).hasAttribute('disabled')).toBe(false));
  });

  it('unlocks after ACK failure and shows one localized inline error', async () => {
    const sellPropertyToBank = vi.fn(() => Promise.resolve(failure));
    renderDebt(debtState(), { sellPropertyToBank });

    const button = screen.getByRole('button', { name: 'Bán Cà Mau cho Ngân hàng' });
    fireEvent.click(button);

    await waitFor(() => expect(button.hasAttribute('disabled')).toBe(false));
    expect(screen.getAllByText('Không thể thực hiện hành động ở trạng thái hiện tại.')).toHaveLength(1);
  });

  it('keeps large inventories at two primary actions per property', () => {
    const sellableProperties = Array.from({ length: 22 }, (_, index) => ({
      tileID: index + 1,
      grossPrice: 50 + index,
      houses: index % 6,
    }));
    renderDebt(debtState({ sellableProperties }));

    expect(screen.getAllByRole('button', { name: /cho Ngân hàng$/ })).toHaveLength(22);
    expect(screen.getAllByRole('button', { name: /^Đề nghị người chơi mua/ })).toHaveLength(22);
    expect(screen.queryByRole('radio')).toBeNull();
  });

  it('disables buyers who cannot afford the authoritative fixed price', () => {
    renderDebt(debtState({
      sellableProperties: [{ tileID: 1, grossPrice: 600, houses: 0 }],
    }));

    fireEvent.click(screen.getByRole('button', { name: 'Đề nghị người chơi mua Cà Mau' }));
    expect(screen.getByRole<HTMLInputElement>('radio', { name: /Bình/ }).disabled).toBe(true);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Gửi đề nghị bán' }).disabled).toBe(true);
    expect(screen.getByText('Không ai đủ tiền để mua với giá 600.000 ₫.')).toBeTruthy();
  });

  it('says what is owed, to whom, what is missing and the cash at hand', () => {
    renderDebt(debtState());

    const dialog = screen.getByRole('alertdialog', { name: 'Cần thanh toán' });
    expect(within(dialog).getByText('Tiền thuê Bạc Liêu')).toBeTruthy();
    expect(within(dialog).getByText('300.000 ₫').previousElementSibling?.textContent).toBe('Cần trả');
    expect(within(dialog).getByText('Ngân hàng')).toBeTruthy();
    expect(within(dialog).getByText('Còn thiếu').nextElementSibling?.textContent).toBe('200.000 ₫');
    expect(within(dialog).getByText('Tiền mặt hiện có').nextElementSibling?.textContent).toBe('100.000 ₫');
    expect(within(dialog).getByText(/giây còn lại$/)).toBeTruthy();
  });

  it('shows the creditor player with an avatar instead of the Bank', () => {
    const state = debtState();
    state.boardState.paymentShortfall = {
      ...state.boardState.paymentShortfall!,
      creditor: 'PLAYER',
      creditorPlayerId: 'player-b',
    };
    renderDebt(state);

    const dialog = screen.getByRole('alertdialog', { name: 'Cần thanh toán' });
    expect(within(dialog).getByText('Bình')).toBeTruthy();
    expect(dialog.querySelector('.debt-panel__creditor img')).not.toBeNull();
    expect(within(dialog).queryByText('Ngân hàng')).toBeNull();
  });

  it('labels each sale with the amount it brings while keeping the tile in the accessible names', () => {
    renderDebt(debtState());

    const sale = screen.getByRole('button', { name: 'Bán Cà Mau cho Ngân hàng' });
    expect(sale.textContent).toBe('Bán cho Ngân hàng +112.000 ₫');
    expect(screen.getByRole('button', { name: 'Đề nghị người chơi mua Cà Mau' }).textContent).toBe('Đề nghị người chơi mua');
  });

  it('starts keyboard focus on the amount owed, so the first sale can sit below the fold', () => {
    renderDebt(debtState());

    const summary = screen.getByRole('region', { name: 'Khoản cần thanh toán' });
    expect(document.activeElement).toBe(summary);
    expect(summary.textContent).toContain('Cần trả');
  });

  it('draws each sellable property as a compact deed under its own heading', () => {
    renderDebt(debtState({ sellableProperties: [{ tileID: 1, grossPrice: 112, houses: 2 }, { tileID: 3, grossPrice: 60, houses: 5 }] }));

    const deeds = document.querySelectorAll('.debt-panel__property .deed--compact');
    expect(deeds).toHaveLength(2);
    expect([...deeds].map(deed => deed.querySelector('.deed__name')?.textContent)).toEqual(['Cà Mau', 'Bạc Liêu']);
    expect(screen.getByRole('heading', { name: 'Bán tài sản để có tiền' })).toBeTruthy();
  });

  it('explains what the buyer picker still needs before an offer can go out', () => {
    renderDebt(debtState());

    fireEvent.click(screen.getByRole('button', { name: 'Đề nghị người chơi mua Cà Mau' }));
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Gửi đề nghị bán' }).disabled).toBe(true);
    expect(screen.getByText('Chọn một người mua để gửi đề nghị.')).toBeTruthy();

    fireEvent.click(screen.getByRole('radio', { name: /Bình/ }));
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Gửi đề nghị bán' }).disabled).toBe(false);
    expect(screen.getByText('Giá cố định 112.000 ₫.')).toBeTruthy();
  });

  it('says so when nothing is left to sell', () => {
    renderDebt(debtState({ sellableProperties: [] }));

    expect(screen.getByText('Bạn không còn tài sản nào để bán.')).toBeTruthy();
    expect(screen.queryByText('Bán tài sản để có tiền')).toBeNull();
  });

  describe('forfeit', () => {
    function renderWithExit(exit: RoomExitContextValue | null, socketFunctions: Partial<SocketFunctions> = {}) {
      return render(
        <roomExitContext.Provider value={exit}>
          <stateContext.Provider value={makeContext(debtState(), socketFunctions)}>
            <DebtPanel />
          </stateContext.Provider>
        </roomExitContext.Provider>,
      );
    }

    it('asks the room exit flow once and sends no command of its own', () => {
      const requestLeave = vi.fn();
      const sellPropertyToBank = vi.fn();
      const proposeForcedSale = vi.fn();
      renderWithExit({ requestLeave, leaving: false, label: 'Bỏ cuộc' }, { sellPropertyToBank, proposeForcedSale });

      const footer = screen.getByRole('alertdialog', { name: 'Cần thanh toán' }).querySelector('.ds-modal__footer') as HTMLElement;
      fireEvent.click(within(footer).getByRole('button', { name: 'Bỏ cuộc' }));

      expect(requestLeave).toHaveBeenCalledTimes(1);
      expect(requestLeave).toHaveBeenCalledWith();
      expect(sellPropertyToBank).not.toHaveBeenCalled();
      expect(proposeForcedSale).not.toHaveBeenCalled();
      expect(screen.getByRole('alertdialog', { name: 'Cần thanh toán' })).toBeTruthy();
    });

    it('is not offered outside the app shell', () => {
      renderWithExit(null);

      expect(screen.getByRole('alertdialog', { name: 'Cần thanh toán' })).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Bỏ cuộc' })).toBeNull();
    });

    it('waits while the leave request is in flight', () => {
      renderWithExit({ requestLeave: vi.fn(), leaving: true, label: 'Bỏ cuộc' });

      expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Bỏ cuộc' }).disabled).toBe(true);
    });

    it('stays reachable when a sale is pending and when nothing can be sold', () => {
      const requestLeave = vi.fn();
      const exit = { requestLeave, leaving: false, label: 'Bỏ cuộc' } as const;
      const pending = renderWithExit(exit, { sellPropertyToBank: vi.fn(() => new Promise<Ack>(() => {})) });
      fireEvent.click(screen.getByRole('button', { name: 'Bán Cà Mau cho Ngân hàng' }));
      expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Bỏ cuộc' }).disabled).toBe(false);
      pending.unmount();

      render(
        <roomExitContext.Provider value={exit}>
          <stateContext.Provider value={makeContext(debtState({ sellableProperties: [] }))}>
            <DebtPanel />
          </stateContext.Provider>
        </roomExitContext.Provider>,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Bỏ cuộc' }));
      expect(requestLeave).toHaveBeenCalledTimes(1);
    });
  });

  describe('observer status', () => {
    it('names the debtor, the creditor and the countdown for another player', () => {
      render(
        <stateContext.Provider value={{ ...makeContext(debtState()), playerId: 'player-b' }}>
          <DebtPanel />
        </stateContext.Provider>,
      );

      const status = screen.getByRole('status');
      expect(status.textContent).toContain('An đang thiếu 200.000 ₫');
      expect(status.textContent).toContain('Trả cho Ngân hàng');
      expect(status.textContent).toMatch(/\d+ giây còn lại/);
      expect(screen.queryByRole('alertdialog')).toBeNull();
    });

    it('is also what the debtor sees while commands cannot be sent', () => {
      render(
        <stateContext.Provider value={{ ...makeContext(debtState()), canMutate: false }}>
          <DebtPanel />
        </stateContext.Provider>,
      );

      expect(screen.getByRole('status').textContent).toContain('An đang thiếu 200.000 ₫');
      expect(screen.queryByRole('alertdialog')).toBeNull();
    });
  });
});

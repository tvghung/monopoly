import {
  act, cleanup, fireEvent, render, screen, waitFor, within,
} from '@testing-library/react';
import type {
  Ack, ForcedSaleProposal, PrivateOffer, PublicGameState, PrivatePlayerState,
} from '@monopoly/shared';
import { SOCKET_PROTOCOL_VERSION } from '@monopoly/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import stateContext from '../../internal';
import { getTileName } from '../../presentation';
import { roomExitContext, type RoomExitContextValue } from '../../roomExitContext';
import type { SocketFunctions, StateContextValue } from '../../types';
import { presentationStoreContext } from '../../game/presentation/PresentationProvider';
import type { AnimationQueue } from '../../game/presentation/queue/AnimationQueue';
import { PresentationStore } from '../../game/presentation/store/presentationStore';
import { makeRoom } from '../../game/presentation/testFixtures';
import DebtPanel from './DebtPanel';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
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
    rescue: null,
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

    expect(screen.getByText('Còn thiếu').nextElementSibling?.textContent).toBe('200.000 ₫');
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

  it('describes the dialog with the amount, the creditor and the shortfall, and the sale with what it brings', () => {
    renderDebt(debtState());

    const dialog = screen.getByRole('alertdialog', { name: 'Cần thanh toán' });
    const description = document.getElementById(dialog.getAttribute('aria-describedby') ?? '')?.textContent ?? '';
    expect(description).toContain('Cần trả 300.000 ₫ cho Ngân hàng');
    expect(description).toContain('Còn thiếu 200.000 ₫');
    expect(description).toContain('Tiền mặt hiện có 100.000 ₫');
    expect(description).not.toMatch(/giây/);

    const sale = screen.getByRole('button', { name: 'Bán Cà Mau cho Ngân hàng' });
    expect(document.getElementById(sale.getAttribute('aria-describedby') ?? '')?.textContent).toBe('Nhận 112.000 ₫');
  });

  it('keeps Shift+Tab and Tab inside the alert dialog from the amount it starts on', () => {
    renderDebt(debtState());
    expect(document.activeElement).toBe(screen.getByRole('region', { name: 'Khoản cần thanh toán' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Cần thanh toán' });

    const back = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
    act(() => { document.dispatchEvent(back); });
    expect(back.defaultPrevented).toBe(true);
    expect(dialog.contains(document.activeElement)).toBe(true);

    screen.getByRole('region', { name: 'Khoản cần thanh toán' }).focus();
    const forward = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    act(() => { document.dispatchEvent(forward); });
    expect(forward.defaultPrevented).toBe(true);
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('counts the deadline down every second', () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    renderDebt(debtState({ actionDeadlineAt: new Date(Date.now() + 60_000).toISOString() }));
    const chip = () => document.querySelector('.debt-panel__countdown')?.textContent;
    expect(chip()).toBe('60 giây còn lại');

    act(() => { vi.advanceTimersByTime(2000); });
    expect(chip()).toBe('58 giây còn lại');
  });

  it.each([
    ['TAX', { kind: 'TAX', tileID: 4 }, getTileName(4)],
    ['CARD from the Cơ Hội deck', { kind: 'CARD', cardId: 'chance-advance-start' }, 'Thẻ Cơ Hội'],
    ['CARD from the Khí Vận deck', { kind: 'CARD', cardId: 'chest-advance-start' }, 'Thẻ Khí Vận'],
    ['CARD with an unknown id', { kind: 'CARD', cardId: 'no-such-card' }, 'Thẻ sự kiện'],
    ['OTHER', { kind: 'OTHER', description: 'Phí đặc biệt' }, 'Phí đặc biệt'],
  ] as const)('names the source of a %s debt above the title', (_name, source, eyebrow) => {
    const state = debtState();
    state.boardState.paymentShortfall = {
      ...state.boardState.paymentShortfall!,
      source: source as NonNullable<PublicGameState['boardState']['paymentShortfall']>['source'],
    };
    renderDebt(state);

    const dialog = screen.getByRole('alertdialog', { name: 'Cần thanh toán' });
    expect(dialog.querySelector('.ds-modal__eyebrow')?.textContent).toBe(eyebrow);
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
    expect(screen.getByText('Người mua sẽ trả 112.000 ₫.')).toBeTruthy();
  });

  describe('the price the seller asks (V1.1)', () => {
    const claimIds = {
      paymentOperationId: '00000000-0000-4000-8000-000000000001',
      claimId: '00000000-0000-4000-8000-000000000002',
    };
    const openPicker = () => fireEvent.click(screen.getByRole('button', { name: 'Đề nghị người chơi mua Cà Mau' }));
    const priceInput = () => screen.getByLabelText<HTMLInputElement>('Giá bán (đơn vị nghìn đồng)');

    it('starts at the Bank price and sends the price the seller typed', () => {
      const proposeForcedSale = vi.fn(() => new Promise<Ack>(() => {}));
      renderDebt(debtState(), { proposeForcedSale });

      openPicker();
      expect(priceInput().value).toBe('112');
      fireEvent.change(priceInput(), { target: { value: '400' } });
      expect(screen.getByText('400.000 ₫')).toBeTruthy();
      fireEvent.click(screen.getByRole('radio', { name: /Bình/ }));
      fireEvent.click(screen.getByRole('button', { name: 'Gửi đề nghị bán' }));

      expect(proposeForcedSale).toHaveBeenCalledWith({
        ...claimIds, tileID: 1, buyerPlayerId: 'player-b', price: 400,
      });
    });

    it('sends the Bank price when the seller keeps it', () => {
      const proposeForcedSale = vi.fn(() => new Promise<Ack>(() => {}));
      renderDebt(debtState(), { proposeForcedSale });

      openPicker();
      fireEvent.click(screen.getByRole('radio', { name: /Bình/ }));
      fireEvent.click(screen.getByRole('button', { name: 'Gửi đề nghị bán' }));

      expect(proposeForcedSale).toHaveBeenCalledWith(expect.objectContaining({ price: 112 }));
    });

    it('judges every buyer by the typed price', () => {
      renderDebt(debtState());

      openPicker();
      expect(screen.getByRole<HTMLInputElement>('radio', { name: /Bình/ }).disabled).toBe(false);
      fireEvent.change(priceInput(), { target: { value: '600' } });

      expect(screen.getByRole<HTMLInputElement>('radio', { name: /Bình/ }).disabled).toBe(true);
      expect(screen.getByText('Không ai đủ tiền để mua với giá 600.000 ₫.')).toBeTruthy();
    });

    it.each([['an empty field', ''], ['zero', '0'], ['a negative number', '-5'], ['a fraction', '12.5'], ['text', 'abc']])(
      'refuses %s as a price',
      (_name, value) => {
        const proposeForcedSale = vi.fn();
        renderDebt(debtState(), { proposeForcedSale });

        openPicker();
        fireEvent.click(screen.getByRole('radio', { name: /Bình/ }));
        fireEvent.change(priceInput(), { target: { value } });

        expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Gửi đề nghị bán' }).disabled).toBe(true);
        expect(screen.getByText('Nhập một giá bán lớn hơn 0.')).toBeTruthy();
        expect(proposeForcedSale).not.toHaveBeenCalled();
      },
    );
  });

  describe('offers to buy a property of the debtor (V1.1)', () => {
    function buyOffer(overrides: Partial<PrivateOffer> = {}): PrivateOffer {
      return {
        offerId: 'offer-debt-1',
        roomId: 'room-1',
        proposerPlayerId: 'player-b',
        recipientPlayerId: 'player-a',
        proposerName: 'Bình',
        recipientName: 'An',
        offered: { cash: 350, propertyIds: [], jailFreeCardIds: [] },
        requested: { cash: 0, propertyIds: [1], jailFreeCardIds: [] },
        status: 'PENDING',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 20_000).toISOString(),
        resolvedAt: null,
        ...overrides,
      };
    }
    function renderWithOffers(offers: PrivateOffer[], socketFunctions: Partial<SocketFunctions> = {}) {
      return render(
        <stateContext.Provider value={{ ...makeContext(debtState(), socketFunctions), privateOffers: offers }}>
          <DebtPanel />
        </stateContext.Provider>,
      );
    }

    it('shows the offer inside the debt dialog, with what it does to the debt, and answers it there', () => {
      const acceptOffer = vi.fn();
      const declineOffer = vi.fn();
      renderWithOffers([buyOffer()], { acceptOffer, declineOffer });

      const dialog = screen.getByRole('alertdialog', { name: 'Cần thanh toán' });
      expect(within(dialog).getByRole('heading', { name: 'Có người muốn mua tài sản của bạn' })).toBeTruthy();
      expect(within(dialog).getByRole('heading', { name: 'Đề nghị mua Cà Mau của Bình' })).toBeTruthy();
      // The debt is 200 and the debtor has 100 in cash: 350 more settles it.
      expect(within(dialog).getByText('Bạn nhận 350.000 ₫, đủ để trả khoản nợ này.')).toBeTruthy();

      fireEvent.click(within(dialog).getByRole('button', { name: 'Chấp nhận' }));
      expect(acceptOffer).toHaveBeenCalledWith('offer-debt-1');
      expect(declineOffer).not.toHaveBeenCalled();
    });

    it('lets the debtor decline the offer from the debt dialog', () => {
      const declineOffer = vi.fn();
      renderWithOffers([buyOffer()], { declineOffer });

      fireEvent.click(screen.getByRole('button', { name: 'Từ chối' }));

      expect(declineOffer).toHaveBeenCalledWith('offer-debt-1');
    });

    it('says what is still missing when the offer does not cover the debt', () => {
      renderWithOffers([buyOffer({ offered: { cash: 50, propertyIds: [], jailFreeCardIds: [] } })]);

      expect(screen.getByText('Bạn nhận 50.000 ₫, vẫn còn thiếu 50.000 ₫ cho khoản nợ này.')).toBeTruthy();
    });

    it('waits for the answer to arrive, then lets the buttons come back if nothing changed', () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
      renderWithOffers([buyOffer()], { acceptOffer: vi.fn() });

      fireEvent.click(screen.getByRole('button', { name: 'Chấp nhận' }));
      expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Chấp nhận' }).disabled).toBe(true);
      expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Từ chối' }).disabled).toBe(true);

      act(() => { vi.advanceTimersByTime(4100); });
      expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Chấp nhận' }).disabled).toBe(false);
    });

    it('does not show offers of any other shape, which the server refuses to accept during a debt', () => {
      renderWithOffers([
        buyOffer({ offerId: 'offer-a', offered: { cash: 100, propertyIds: [3], jailFreeCardIds: [] } }),
        buyOffer({ offerId: 'offer-b', requested: { cash: 20, propertyIds: [1], jailFreeCardIds: [] } }),
        buyOffer({ offerId: 'offer-c', requested: { cash: 0, propertyIds: [], jailFreeCardIds: [] } }),
      ]);

      expect(screen.queryByRole('heading', { name: 'Có người muốn mua tài sản của bạn' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Chấp nhận' })).toBeNull();
    });

    it('does not show a debt offer addressed to somebody else', () => {
      renderWithOffers([buyOffer({ recipientPlayerId: 'player-b', proposerPlayerId: 'player-a' })]);

      expect(screen.queryByRole('button', { name: 'Chấp nhận' })).toBeNull();
    });
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

    it('shows a failed leave request inside the dialog, above the modal layer', () => {
      renderWithExit({
        requestLeave: vi.fn(), leaving: false, label: 'Bỏ cuộc', error: 'Không thể rời phòng lúc này.',
      });

      const dialog = screen.getByRole('alertdialog', { name: 'Cần thanh toán' });
      expect(within(dialog).getByRole('alert').textContent).toBe('Không thể rời phòng lúc này.');
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
      // The countdown ticks every second, so it must not sit inside the live region that would read it out each time.
      expect(status.textContent).not.toMatch(/giây/);
      expect(screen.getByRole('timer').textContent).toMatch(/\d+ giây còn lại/);
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

  describe('waits for the animations that lead to the debt (V1.1 item 1)', () => {
    /** The room as the board still shows it: An has all his cash and has not moved. */
    function displayStore(status: 'idle' | 'playing'): PresentationStore {
      const store = new PresentationStore();
      store.resetFromSnapshot(makeRoom());
      store.setStatus(status);
      return store;
    }

    function renderWithStore(state: PublicGameState, store: PresentationStore) {
      return render(
        <presentationStoreContext.Provider value={{ store, queue: null as unknown as AnimationQueue }}>
          <stateContext.Provider value={makeContext(state)}>
            <DebtPanel />
          </stateContext.Provider>
        </presentationStoreContext.Provider>,
      );
    }

    it('keeps the window away while the token hops and the coins fly, then opens it with the same debt', () => {
      const store = displayStore('playing');
      renderWithStore(debtState(), store);

      expect(screen.queryByRole('alertdialog')).toBeNull();
      expect(screen.queryByRole('status')).toBeNull();

      // The queue has played everything: the display shows An with 100.000 ₫ and the queue is idle.
      act(() => {
        store.resetFromSnapshot({ ...makeRoom(), gameState: debtState() });
        store.setStatus('idle');
      });
      expect(screen.getByRole('alertdialog', { name: 'Cần thanh toán' })).toBeTruthy();
      expect(screen.getByText('Còn thiếu').nextElementSibling?.textContent).toBe('200.000 ₫');
    });

    it('keeps the status line the other players see away for the same time', () => {
      const store = displayStore('playing');
      render(
        <presentationStoreContext.Provider value={{ store, queue: null as unknown as AnimationQueue }}>
          <stateContext.Provider value={{ ...makeContext(debtState()), playerId: 'player-b' }}>
            <DebtPanel />
          </stateContext.Provider>
        </presentationStoreContext.Provider>,
      );
      expect(screen.queryByRole('status')).toBeNull();

      act(() => {
        store.resetFromSnapshot({ ...makeRoom(), gameState: debtState() });
        store.setStatus('idle');
      });
      expect(screen.getByRole('status').textContent).toContain('An đang thiếu 200.000 ₫');
    });
  });
});

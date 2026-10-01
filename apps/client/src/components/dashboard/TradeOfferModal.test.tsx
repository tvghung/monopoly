import {
  cleanup, fireEvent, render, screen, within,
} from '@testing-library/react';
import type { PublicGameState } from '@monopoly/shared';
import {
  afterEach, describe, expect, it, vi,
} from 'vitest';
import stateContext from '../../internal';
import tradePromptContext from '../../tradePromptContext';
import type { SocketFunctions, StateContextValue } from '../../types';
import TradeOfferModal, { describeTradeSide } from './TradeOfferModal';

afterEach(cleanup);

const state: PublicGameState = {
  boardState: {
    gameStarted: true,
    players: ['me', 'them'],
    finishedPlayers: {},
    turnNumber: 2,
    currentPlayer: { id: '', hasMoved: false },
    turnRecovery: null,
    logs: [],
    diceValue: { dice1: 2, dice2: 3 },
    rollSequence: 1,
    gameplayEvents: { sequence: 0, events: [] },
    activityFeed: { sequence: 0, events: [] },
    ownedProps: {
      1: { id: 'them', color: 'blue', houses: 0 },
      3: { id: 'them', color: 'blue', houses: 0 },
      5: { id: 'me', color: 'red', houses: 0 },
      12: { id: 'me', color: 'red', houses: 0 },
    },
    winner: null,
  },
  players: {
    me: {
      name: 'An',
      currentTile: 0,
      color: 'red',
      characterId: 'dog',
      accountBalance: 1500,
      isJail: false,
      jailOpponentRoundsElapsed: 0,
      getOutOfJailCardCount: 1,
    },
    them: {
      name: 'Bình',
      currentTile: 10,
      color: 'blue',
      characterId: 'panda',
      accountBalance: 900,
      isJail: false,
      jailOpponentRoundsElapsed: 0,
      getOutOfJailCardCount: 1,
    },
  },
  turnInfo: {},
  deckCounts: { chance: 15, chest: 15 },
  loaded: true,
};

describe('TradeOfferModal', () => {
  it('sends cash, multiple properties and only the current player private card ids', () => {
    const makeOffer = vi.fn();
    const closeTrade = vi.fn();
    const contextValue: StateContextValue = {
      state,
      socketFunctions: { makeOffer } as unknown as SocketFunctions,
      playerId: 'me',
      role: 'PLAYER',
      connected: true,
      canMutate: true,
      privatePlayerState: {
        playerId: 'me',
        heldJailFreeCardIds: ['chance-jail-free'],
        gameplayEvents: { sequence: 0, events: [] },
      },
      privateOffers: [],
    };

    render(
      <stateContext.Provider value={contextValue}>
        <tradePromptContext.Provider value={{
          tradeTarget: { tileID: 1 },
          openTradeForProperty: vi.fn(),
          closeTrade,
        }}
        >
          <TradeOfferModal />
        </tradePromptContext.Provider>
      </stateContext.Provider>,
    );

    expect(screen.getByText(/Bình đang giữ 1 thẻ, nhưng danh tính thẻ là dữ liệu riêng/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Tiền (đơn vị nghìn đồng)', { selector: '#private-offer-cash' }), {
      target: { value: '200' },
    });
    fireEvent.change(screen.getByLabelText('Tiền (đơn vị nghìn đồng)', { selector: '#private-request-cash' }), {
      target: { value: '75' },
    });
    fireEvent.click(screen.getByLabelText(/Ga Hà Nội/));
    fireEvent.click(screen.getByLabelText(/Công Ty Điện/));
    fireEvent.click(screen.getByLabelText(/Bạc Liêu/));
    fireEvent.click(screen.getByLabelText(/Thẻ Thoát Tù Miễn Phí \(Cơ Hội\)/));
    fireEvent.click(screen.getByRole('button', { name: 'Gửi đề nghị' }));

    expect(makeOffer).toHaveBeenCalledWith({
      recipientPlayerId: 'them',
      offered: {
        cash: 200,
        propertyIds: [5, 12],
        jailFreeCardIds: ['chance-jail-free'],
      },
      requested: {
        cash: 75,
        propertyIds: [1, 3],
        jailFreeCardIds: [],
      },
    });
  });
});

function renderTrade(options: { closeTrade?: () => void; makeOffer?: () => void; heldCards?: boolean } = {}) {
  const contextValue: StateContextValue = {
    state,
    socketFunctions: { makeOffer: options.makeOffer ?? vi.fn() } as unknown as SocketFunctions,
    playerId: 'me',
    role: 'PLAYER',
    connected: true,
    canMutate: true,
    privatePlayerState: {
      playerId: 'me',
      heldJailFreeCardIds: options.heldCards === false ? [] : ['chance-jail-free'],
      gameplayEvents: { sequence: 0, events: [] },
    },
    privateOffers: [],
  };
  return render(
    <stateContext.Provider value={contextValue}>
      <tradePromptContext.Provider value={{
        tradeTarget: { tileID: 1 },
        openTradeForProperty: vi.fn(),
        closeTrade: options.closeTrade ?? vi.fn(),
      }}
      >
        <TradeOfferModal />
      </tradePromptContext.Provider>
    </stateContext.Provider>,
  );
}

describe('TradeOfferModal layout and feedback', () => {
  it('is an extra-large dialog with a legend and an owner row for each side', () => {
    renderTrade();

    const dialog = screen.getByRole('dialog', { name: 'Giao dịch với Bình' });
    expect(dialog.classList.contains('ds-modal--xl')).toBe(true);
    const give = screen.getByRole('group', { name: 'Bạn giao' });
    const receive = screen.getByRole('group', { name: 'Bạn nhận' });
    expect(within(give).getByText('An (bạn)')).toBeTruthy();
    expect(within(receive).getByText('Bình')).toBeTruthy();
    expect(give.querySelector('.ds-avatar')).not.toBeNull();
    expect(receive.querySelector('.ds-avatar')).not.toBeNull();
  });

  it('puts the cursor in the cash field you give and keeps both cash ids', () => {
    renderTrade();

    expect(document.activeElement?.id).toBe('private-offer-cash');
    expect(document.getElementById('private-request-cash')).not.toBeNull();
  });

  it('draws owned deeds as chips behind real checkboxes named after the tile', () => {
    renderTrade();

    const give = screen.getByRole('group', { name: 'Bạn giao' });
    const receive = screen.getByRole('group', { name: 'Bạn nhận' });
    const mine = within(give).getByRole<HTMLInputElement>('checkbox', { name: 'Ga Hà Nội' });
    expect(mine.checked).toBe(false);
    expect(mine.closest('label')?.querySelector('.deed--chip')).not.toBeNull();
    // The property the offer started from is already asked for.
    expect(within(receive).getByRole<HTMLInputElement>('checkbox', { name: 'Cà Mau' }).checked).toBe(true);
    expect(within(receive).getByRole<HTMLInputElement>('checkbox', { name: 'Bạc Liêu' }).checked).toBe(false);
    expect(within(give).getByRole('checkbox', { name: 'Thẻ Thoát Tù Miễn Phí (Cơ Hội)' })).toBeTruthy();
  });

  it('previews each cash amount as formatted money', () => {
    renderTrade();

    expect(document.querySelectorAll('.trade-bundle__preview')).toHaveLength(0);
    fireEvent.change(document.getElementById('private-offer-cash')!, { target: { value: '1250' } });
    fireEvent.change(document.getElementById('private-request-cash')!, { target: { value: '75' } });

    const previews = [...document.querySelectorAll('.trade-bundle__preview')].map(node => node.textContent);
    expect(previews).toEqual(['1.250.000 ₫', '75.000 ₫']);
  });

  it('summarises both sides of the offer as it is composed', () => {
    renderTrade();
    const summary = () => document.querySelector('.trade-offer-summary__line')?.textContent;

    expect(summary()).toBe('Bạn giao chưa có gì · Bạn nhận 1 tài sản');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Ga Hà Nội' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Công Ty Điện' }));
    fireEvent.change(document.getElementById('private-offer-cash')!, { target: { value: '50' } });
    expect(summary()).toBe('Bạn giao 2 tài sản + 50.000 ₫ · Bạn nhận 1 tài sản');

    fireEvent.click(screen.getByRole('checkbox', { name: 'Thẻ Thoát Tù Miễn Phí (Cơ Hội)' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Bạc Liêu' }));
    fireEvent.change(document.getElementById('private-request-cash')!, { target: { value: '75' } });
    expect(summary()).toBe('Bạn giao 2 tài sản + 1 thẻ Thoát Tù + 50.000 ₫ · Bạn nhận 2 tài sản + 75.000 ₫');
  });

  it('explains why sending is disabled and enables it once something is on the table', () => {
    renderTrade();
    const send = () => screen.getByRole<HTMLButtonElement>('button', { name: 'Gửi đề nghị' });

    expect(send().disabled).toBe(false);
    expect(screen.queryByText('Chọn tiền, tài sản hoặc thẻ để gửi đề nghị.')).toBeNull();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Cà Mau' }));
    expect(send().disabled).toBe(true);
    expect(screen.getByText('Chọn tiền, tài sản hoặc thẻ để gửi đề nghị.')).toBeTruthy();
    expect(send().getAttribute('aria-describedby')).toBe(document.querySelector('.trade-offer-summary__line')?.id);

    fireEvent.change(document.getElementById('private-offer-cash')!, { target: { value: '10' } });
    expect(send().disabled).toBe(false);
    expect(screen.queryByText('Chọn tiền, tài sản hoặc thẻ để gửi đề nghị.')).toBeNull();
  });

  it('sends from the footer button through the form and closes the dialog', () => {
    const makeOffer = vi.fn();
    const closeTrade = vi.fn();
    renderTrade({ makeOffer, closeTrade });

    const send = screen.getByRole('button', { name: 'Gửi đề nghị' });
    expect(send.closest('.ds-modal__footer')).not.toBeNull();
    expect(send.getAttribute('form')).toBe(document.querySelector('form.trade-offer-form')?.id);
    fireEvent.click(send);

    expect(makeOffer).toHaveBeenCalledTimes(1);
    expect(makeOffer).toHaveBeenCalledWith({
      recipientPlayerId: 'them',
      offered: { cash: 0, propertyIds: [], jailFreeCardIds: [] },
      requested: { cash: 0, propertyIds: [1], jailFreeCardIds: [] },
    });
    expect(closeTrade).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape and with the close button, without sending', () => {
    const makeOffer = vi.fn();
    const closeTrade = vi.fn();
    renderTrade({ makeOffer, closeTrade });

    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Đóng' }));

    expect(closeTrade).toHaveBeenCalledTimes(2);
    expect(makeOffer).not.toHaveBeenCalled();
  });

  it('keeps the privacy note about the other player cards and says when you hold none', () => {
    renderTrade({ heldCards: false });

    expect(document.getElementById('requested-card-privacy')?.textContent).toContain('Bình đang giữ 1 thẻ');
    expect(screen.getByText('Bạn không giữ thẻ nào.')).toBeTruthy();
  });
});

describe('describeTradeSide', () => {
  it('lists tài sản, thẻ and cash, or says nothing is there', () => {
    expect(describeTradeSide(0, 0, 0)).toBe('chưa có gì');
    expect(describeTradeSide(1, 0, 0)).toBe('1 tài sản');
    expect(describeTradeSide(2, 1, 50)).toBe('2 tài sản + 1 thẻ Thoát Tù + 50.000 ₫');
    expect(describeTradeSide(0, 0, 25)).toBe('25.000 ₫');
  });
});

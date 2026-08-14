import {
  cleanup, fireEvent, render, screen,
} from '@testing-library/react';
import type { PublicGameState } from '@monopoly/shared';
import {
  afterEach, describe, expect, it, vi,
} from 'vitest';
import stateContext from '../../internal';
import sellPromptContext from '../../sellPromptContext';
import type { SocketFunctions, StateContextValue } from '../../types';
import SellPrompts from './SellPrompts';

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
    ownedProps: {
      1: { id: 'them', color: 'blue', houses: 0, mortgaged: true },
      3: { id: 'them', color: 'blue', houses: 0, mortgaged: false },
      5: { id: 'me', color: 'red', houses: 0, mortgaged: false },
      12: { id: 'me', color: 'red', houses: 0, mortgaged: true },
    },
    openMarket: {},
    winner: null,
  },
  players: {
    me: {
      name: 'An',
      currentTile: 0,
      color: 'red',
      accountBalance: 1500,
      isJail: false,
      jailOpponentRoundsElapsed: 0,
      getOutOfJailCardCount: 1,
    },
    them: {
      name: 'Bình',
      currentTile: 10,
      color: 'blue',
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

describe('SellPrompts trade bundles', () => {
  it('sends cash, multiple properties and only the current player private card ids', () => {
    const makeOffer = vi.fn();
    const setPrivateSale = vi.fn();
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
      },
      privateOffers: [],
    };

    render(
      <stateContext.Provider value={contextValue}>
        <sellPromptContext.Provider value={{
          handlePutOpenMarket: vi.fn(),
          handleMakeOffer: vi.fn(),
          openSale: false,
          setOpenSale: vi.fn(),
          privateSale: { tileID: 1 },
          setPrivateSale,
        }}
        >
          <SellPrompts />
        </sellPromptContext.Provider>
      </stateContext.Provider>,
    );

    expect(screen.getByText(/Bình đang giữ 1 thẻ, nhưng danh tính thẻ là dữ liệu riêng/)).toBeTruthy();
    expect(screen.getByText(/Cà Mau.*bạn trả thêm 3\.000 ₫.*10% giá trị cầm cố/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Tiền (đơn vị nghìn đồng)', { selector: '#private-offer-cash' }), {
      target: { value: '200' },
    });
    fireEvent.change(screen.getByLabelText('Tiền (đơn vị nghìn đồng)', { selector: '#private-request-cash' }), {
      target: { value: '75' },
    });
    fireEvent.click(screen.getByLabelText(/Ga Hà Nội/));
    fireEvent.click(screen.getByLabelText(/Công Ty Điện.*đang cầm cố/));
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

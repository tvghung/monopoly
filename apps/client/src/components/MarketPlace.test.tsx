import {
  cleanup, fireEvent, render, screen,
} from '@testing-library/react';
import type { PublicGameState } from '@monopoly/shared';
import {
  afterEach, describe, expect, it, vi,
} from 'vitest';
import stateContext from '../internal';
import type { SocketFunctions, StateContextValue } from '../types';
import MarketPlace from './MarketPlace';

afterEach(cleanup);

describe('MarketPlace mortgage cost', () => {
  it('shows the 10% transfer surcharge and includes it in the buy total', () => {
    const makeSale = vi.fn();
    const state: PublicGameState = {
      boardState: {
        gameStarted: true,
        players: ['buyer', 'seller'],
        finishedPlayers: {},
        turnNumber: 2,
        currentPlayer: { id: '', hasMoved: false },
        turnRecovery: null,
        logs: [],
        diceValue: { dice1: 2, dice2: 3 },
        ownedProps: {
          1: { id: 'seller', color: 'blue', houses: 0, mortgaged: true },
        },
        openMarket: {
          1: { seller: 'seller', price: 100, sellerName: 'Bình', tileName: 'Cà Mau' },
        },
        winner: null,
      },
      players: {},
      turnInfo: {},
      deckCounts: { chance: 16, chest: 16 },
      loaded: true,
    };
    const contextValue: StateContextValue = {
      state,
      socketFunctions: { makeSale } as unknown as SocketFunctions,
      playerId: 'buyer',
      role: 'PLAYER',
      connected: true,
      canMutate: true,
      privatePlayerState: null,
      privateOffers: [],
    };

    render(
      <stateContext.Provider value={contextValue}>
        <MarketPlace />
      </stateContext.Provider>,
    );

    expect(screen.getByText((_content, element) => (
      element?.classList.contains('market-listing__mortgage') === true
      && element.textContent === 'Đang cầm cố — người mua trả thêm 3.000 ₫ lãi chuyển nhượng (10% giá trị cầm cố). Tổng thanh toán: 103.000 ₫.'
    ))).toBeTruthy();
    const buy = screen.getByRole('button', { name: 'Mua Cà Mau, tổng thanh toán 103.000 ₫' });
    fireEvent.click(buy);
    expect(makeSale).toHaveBeenCalledWith(1);
  });
});

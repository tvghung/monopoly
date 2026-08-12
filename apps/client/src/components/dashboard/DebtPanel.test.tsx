import {
  cleanup, fireEvent, render, screen,
} from '@testing-library/react';
import type { PublicGameState } from '@monopoly/shared';
import {
  afterEach, describe, expect, it, vi,
} from 'vitest';
import stateContext from '../../internal';
import type { SocketFunctions, StateContextValue } from '../../types';
import DebtPanel from './DebtPanel';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('DebtPanel', () => {
  it('shows a Vietnamese debt action and emits settle or bankruptcy commands', () => {
    const settleDebt = vi.fn();
    const declareBankruptcy = vi.fn();
    const state: PublicGameState = {
      boardState: {
        gameStarted: true,
        players: ['player-a'],
        finishedPlayers: {},
        currentPlayer: { id: 'player-a', hasMoved: true, doublesStreak: 0 },
        turnNumber: 3,
        turnRecovery: null,
        logs: [],
        diceValue: { dice1: 2, dice2: 3 },
        ownedProps: {},
        openMarket: {},
        winner: null,
        auction: null,
        buildingContention: null,
        bankPropertyAuctionQueue: null,
        paymentQueue: {
          debtorPlayerId: 'player-a',
          creditor: 'BANK',
          amount: 200,
          remainingAmount: 200,
          source: { kind: 'TAX', tileID: 4 },
          actionDeadlineAt: new Date(Date.now() + 60_000).toISOString(),
          remainingClaimCount: 1,
        },
      },
      players: {
        'player-a': {
          name: 'An',
          currentTile: 4,
          color: 'red',
          accountBalance: 300,
          isJail: false,
          jailRounds: 0,
          getOutOfJailCardCount: 0,
        },
      },
      turnInfo: {},
      deckCounts: { chance: 16, chest: 16 },
      bankBuildingInventory: { housesAvailable: 32, hotelsAvailable: 12 },
      loaded: true,
    };
    const value: StateContextValue = {
      state,
      playerId: 'player-a',
      role: 'PLAYER',
      connected: true,
      canMutate: true,
      privatePlayerState: null,
      privateOffers: [],
      socketFunctions: {
        settleDebt,
        declareBankruptcy,
      } as unknown as SocketFunctions,
    };
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(
      <stateContext.Provider value={value}>
        <DebtPanel />
      </stateContext.Provider>,
    );

    expect(screen.getByText(/200\.000 ₫/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Thanh toán ngay' }));
    expect(settleDebt).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole('button', { name: 'Tuyên bố phá sản' }));
    expect(declareBankruptcy).toHaveBeenCalledOnce();
  });
});

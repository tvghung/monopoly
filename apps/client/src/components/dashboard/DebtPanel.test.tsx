import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { PublicGameState } from '@monopoly/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import stateContext from '../../internal';
import type { SocketFunctions, StateContextValue } from '../../types';
import DebtPanel from './DebtPanel';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('DebtPanel', () => {
  it('shows authoritative forced-sale values and sells to the Bank', () => {
    const sellPropertyToBank = vi.fn();
    const state: PublicGameState = {
      boardState: {
        gameStarted: true,
        players: ['player-a', 'player-b'],
        finishedPlayers: {},
        currentPlayer: { id: 'player-a', hasMoved: true },
        turnNumber: 3,
        turnRecovery: null,
        logs: [],
        diceValue: { dice1: 2, dice2: 3 },
        ownedProps: { 1: { id: 'player-a', color: 'red', houses: 2 } },
        winner: null,
        paymentShortfall: {
          debtorPlayerId: 'player-a',
          creditor: 'BANK',
          amount: 300,
          remainingAmount: 200,
          source: { kind: 'RENT', tileID: 3 },
          actionDeadlineAt: new Date(Date.now() + 60_000).toISOString(),
          remainingClaimCount: 1,
          paymentOperationId: '00000000-0000-4000-8000-000000000001',
          claimId: '00000000-0000-4000-8000-000000000002',
          sellableProperties: [{
            tileID: 1,
            grossPrice: 112,
            houses: 2,
          }],
        },
      },
      players: {
        'player-a': {
          name: 'An', currentTile: 3, color: 'red', accountBalance: 100, isJail: false,
          jailOpponentRoundsElapsed: 0, getOutOfJailCardCount: 0, characterId: 'dog',
        },
        'player-b': {
          name: 'Bình', currentTile: 5, color: 'blue', accountBalance: 500, isJail: false,
          jailOpponentRoundsElapsed: 0, getOutOfJailCardCount: 0, characterId: 'panda',
        },
      },
      turnInfo: {},
      deckCounts: { chance: 16, chest: 16 },
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
      socketFunctions: { sellPropertyToBank } as unknown as SocketFunctions,
    };

    render(<stateContext.Provider value={value}><DebtPanel /></stateContext.Provider>);
    expect(screen.getByText(/200\.000 ₫/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Bán cho Ngân hàng' }));
    expect(sellPropertyToBank).toHaveBeenCalledWith({
      paymentOperationId: '00000000-0000-4000-8000-000000000001',
      claimId: '00000000-0000-4000-8000-000000000002',
      tileID: 1,
    });
  });
});

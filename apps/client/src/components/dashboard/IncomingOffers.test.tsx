import { cleanup, render, screen } from '@testing-library/react';
import type { PrivateOffer, PublicGameState } from '@monopoly/shared';
import {
  afterEach, describe, expect, it, vi,
} from 'vitest';
import stateContext from '../../internal';
import type { SocketFunctions, StateContextValue } from '../../types';
import IncomingOffers from './IncomingOffers';

afterEach(cleanup);

describe('IncomingOffers mortgage preview', () => {
  it('separates the surcharge paid by each receiver from the bundle cash', () => {
    const state: PublicGameState = {
      boardState: {
        gameStarted: true,
        players: ['proposer', 'recipient'],
        finishedPlayers: {},
        turnNumber: 2,
        currentPlayer: { id: '', hasMoved: false },
        turnRecovery: null,
        logs: [],
        diceValue: { dice1: 2, dice2: 3 },
        ownedProps: {
          1: { id: 'proposer', color: 'red', houses: 0, mortgaged: true },
          37: { id: 'recipient', color: 'blue', houses: 0, mortgaged: true },
        },
        openMarket: {},
        winner: null,
      },
      players: {},
      turnInfo: {},
      deckCounts: { chance: 16, chest: 16 },
      loaded: true,
    };
    const offer: PrivateOffer = {
      offerId: 'offer-1',
      roomId: 'room-1',
      proposerPlayerId: 'proposer',
      recipientPlayerId: 'recipient',
      proposerName: 'An',
      recipientName: 'Bình',
      offered: { cash: 100, propertyIds: [1], jailFreeCardIds: [] },
      requested: { cash: 25, propertyIds: [37], jailFreeCardIds: [] },
      status: 'PENDING',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      resolvedAt: null,
    };
    const contextValue: StateContextValue = {
      state,
      socketFunctions: {
        acceptOffer: vi.fn(),
        declineOffer: vi.fn(),
      } as unknown as SocketFunctions,
      playerId: 'recipient',
      role: 'PLAYER',
      connected: true,
      canMutate: true,
      privatePlayerState: null,
      privateOffers: [offer],
    };

    render(
      <stateContext.Provider value={contextValue}>
        <IncomingOffers />
      </stateContext.Provider>,
    );

    expect(screen.getByText('Bạn trả 3.000 ₫: Cà Mau (3.000 ₫).')).toBeTruthy();
    expect(screen.getByText('An trả 18.000 ₫: Đồng Khởi (18.000 ₫).')).toBeTruthy();
    expect(screen.getByText(/10% giá trị cầm cố.*tách khỏi tiền đổi/)).toBeTruthy();
  });
});

import {
  cleanup, fireEvent, render, screen, waitFor,
} from '@testing-library/react';
import type { PublicGameState } from '@monopoly/shared';
import {
  afterEach, describe, expect, it, vi,
} from 'vitest';
import stateContext from '../internal';
import type { SocketFunctions, StateContextValue } from '../types';
import Board from './Board';

afterEach(cleanup);

const socketFunctions: SocketFunctions = {
  rollDice: vi.fn(),
  buyProperty: vi.fn(),
  sendChat: vi.fn(),
  makeOffer: vi.fn(),
  acceptOffer: vi.fn(),
  declineOffer: vi.fn(),
  sellHouse: vi.fn(),
  payBail: vi.fn(),
  useJailCard: vi.fn(),
};

const gameState: PublicGameState = {
  boardState: {
    gameStarted: true,
    players: [],
    finishedPlayers: {},
    turnNumber: 1,
    currentPlayer: { id: '', hasMoved: false },
    turnRecovery: null,
    logs: [],
    diceValue: { dice1: 0, dice2: 0 },
    ownedProps: {},
    winner: null,
  },
  players: {},
  turnInfo: {},
  deckCounts: { chance: 16, chest: 16 },
  loaded: true,
};

const contextValue: StateContextValue = {
  state: gameState,
  socketFunctions,
  playerId: null,
  role: 'SPECTATOR',
  connected: true,
  canMutate: false,
  privatePlayerState: null,
  privateOffers: [],
};

describe('Vietnamese game board', () => {
  it('renders exactly 40 canonical tiles as keyboard-accessible controls', () => {
    const { container } = render(
      <stateContext.Provider value={contextValue}>
        <Board />
      </stateContext.Provider>,
    );

    expect(container.querySelectorAll('[data-tile-index]')).toHaveLength(40);
    expect(screen.getByRole('button', { name: /Ô 0: Xuất Phát/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Ô 39: Landmark 81.*400\.000 ₫/ })).toBeTruthy();
  });

  it('opens derived property details and closes them with Escape', async () => {
    render(
      <stateContext.Provider value={contextValue}>
        <Board />
      </stateContext.Provider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /Ô 1: Cà Mau/ }));
    expect(screen.getByRole('dialog', { name: 'Cà Mau' })).toBeTruthy();
    expect(screen.getByText('Có Khách Sạn')).toBeTruthy();
    expect(screen.getByText('250.000 ₫')).toBeTruthy();

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Cà Mau' })).toBeNull();
    });
  });
});

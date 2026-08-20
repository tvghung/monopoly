import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { PublicGameState } from '@monopoly/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import stateContext from '../internal';
import type { SocketFunctions, StateContextValue } from '../types';
import BoardAccessibilityControls from './BoardAccessibilityControls';

afterEach(cleanup);

const state: PublicGameState = {
  boardState: {
    gameStarted: true,
    players: [],
    finishedPlayers: {},
    turnNumber: 1,
    currentPlayer: { id: '', hasMoved: false },
    turnRecovery: null,
    logs: [],
    diceValue: { dice1: 0, dice2: 0 },
    rollSequence: 0,
    ownedProps: {},
    winner: null,
  },
  players: {},
  turnInfo: {},
  deckCounts: { chance: 16, chest: 16 },
  loaded: true,
};

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

const contextValue: StateContextValue = {
  state,
  socketFunctions,
  playerId: null,
  role: 'SPECTATOR',
  connected: true,
  canMutate: false,
  privatePlayerState: null,
  privateOffers: [],
};

describe('BoardAccessibilityControls', () => {
  it('exposes all canonical tiles and forwards focus/click selection', () => {
    const onHover = vi.fn();
    const onSelect = vi.fn();
    render(
      <stateContext.Provider value={contextValue}>
        <BoardAccessibilityControls
          selectedTileId={1}
          onHover={onHover}
          onSelect={onSelect}
        />
      </stateContext.Provider>,
    );

    const controls = screen.getAllByRole('button');
    expect(controls).toHaveLength(40);
    const caMau = screen.getByRole('button', { name: /Ô 1: Cà Mau/ });
    expect(caMau.getAttribute('aria-expanded')).toBe('true');

    fireEvent.focus(caMau);
    fireEvent.click(caMau);
    fireEvent.blur(caMau);
    expect(onHover).toHaveBeenNthCalledWith(1, 1);
    expect(onSelect).toHaveBeenCalledWith(1);
    expect(onHover).toHaveBeenLastCalledWith(null);
  });
});

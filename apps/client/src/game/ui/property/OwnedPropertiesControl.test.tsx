import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { PublicGameState } from '@monopoly/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import stateContext from '../../../internal';
import type { SocketFunctions, StateContextValue } from '../../../types';
import OwnedPropertiesControl from './OwnedPropertiesControl';

const playerId = 'player-a';

const socketFunctions = {
  rollDice: vi.fn(), buyProperty: vi.fn(), sendChat: vi.fn(), makeOffer: vi.fn(),
  acceptOffer: vi.fn(), declineOffer: vi.fn(), sellHouse: vi.fn(), payBail: vi.fn(),
  useJailCard: vi.fn(),
} satisfies SocketFunctions;

function makeState(balance: number, includePlayer = true): PublicGameState {
  return {
    boardState: {
      gameStarted: true,
      players: includePlayer ? [playerId, 'player-b', 'player-c', 'player-d'] : ['player-b'],
      finishedPlayers: {},
      currentPlayer: { id: playerId, hasMoved: false },
      turnNumber: 1,
      turnRecovery: null,
      logs: [],
      diceValue: { dice1: 0, dice2: 0 },
      rollSequence: 0,
      gameplayEvents: { sequence: 0, events: [] },
      activityFeed: { sequence: 0, events: [] },
      ownedProps: includePlayer
        ? {
          1: { id: playerId, color: 'red', houses: 2 },
          5: { id: playerId, color: 'red', houses: 0 },
          12: { id: 'player-b', color: 'blue', houses: 0 },
        }
        : {},
      winner: null,
    },
    players: includePlayer
      ? {
        [playerId]: {
          name: 'An', currentTile: 0, color: 'red', characterId: 'dog', accountBalance: balance,
          isJail: false, jailOpponentRoundsElapsed: 0, getOutOfJailCardCount: 0,
        },
        'player-b': {
          name: 'Bình', currentTile: 0, color: 'blue', characterId: 'panda', accountBalance: 900,
          isJail: false, jailOpponentRoundsElapsed: 0, getOutOfJailCardCount: 0,
        },
      }
      : {},
    turnInfo: {},
    deckCounts: { chance: 16, chest: 16 },
    loaded: true,
  };
}

function context(state: PublicGameState): StateContextValue {
  return {
    state,
    socketFunctions,
    playerId,
    role: 'PLAYER',
    connected: true,
    canMutate: true,
    privatePlayerState: null,
    privateOffers: [],
  };
}

describe('OwnedPropertiesControl', () => {
  afterEach(cleanup);

  it('shows authoritative balance, owned count, group identity, development, and inspect actions', () => {
    const onSelect = vi.fn();
    render(
      <stateContext.Provider value={context(makeState(1_250))}>
        <OwnedPropertiesControl onSelect={onSelect} />
      </stateContext.Provider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Tài sản của tôi (2)' }));
    expect(screen.getByText('Số dư hiện tại')).toBeTruthy();
    expect(screen.getByText('1.250.000 ₫')).toBeTruthy();
    expect(screen.getByText('2 tài sản')).toBeTruthy();
    expect(screen.getByText(/Nhóm Nâu.*2 Nhà/u)).toBeTruthy();
    expect(screen.getByText('Ga tàu')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Xem Cà Mau' }));
    expect(onSelect).toHaveBeenCalledWith(1);
    expect(screen.queryByText('Số dư hiện tại')).toBeNull();
  });

  it('updates a zero/current balance while open and disappears after player removal', () => {
    const view = render(
      <stateContext.Provider value={context(makeState(0))}>
        <OwnedPropertiesControl onSelect={vi.fn()} />
      </stateContext.Provider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Tài sản của tôi (2)' }));
    expect(screen.getByText('0 ₫')).toBeTruthy();

    view.rerender(
      <stateContext.Provider value={context(makeState(725))}>
        <OwnedPropertiesControl onSelect={vi.fn()} />
      </stateContext.Provider>,
    );
    expect(screen.getByText('725.000 ₫')).toBeTruthy();

    view.rerender(
      <stateContext.Provider value={context(makeState(0, false))}>
        <OwnedPropertiesControl onSelect={vi.fn()} />
      </stateContext.Provider>,
    );
    expect(screen.queryByRole('button', { name: /Tài sản của tôi/u })).toBeNull();
  });

  it('shows the balance and an empty state when the player owns no properties', () => {
    const state = makeState(350);
    state.boardState.ownedProps = {};
    render(
      <stateContext.Provider value={context(state)}>
        <OwnedPropertiesControl onSelect={vi.fn()} />
      </stateContext.Provider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Tài sản của tôi (0)' }));
    expect(screen.getByText('350.000 ₫')).toBeTruthy();
    expect(screen.getByText('0 tài sản')).toBeTruthy();
    expect(screen.getByText('Bạn chưa sở hữu tài sản nào.')).toBeTruthy();
  });
});
